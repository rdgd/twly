#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const chalk = require('chalk');
const glob = require('glob');
const path = require('path');
const binaries = require('binary-extensions');

const constants = require('./constants');
const Message = require('./message');
const Report = require('./report.js');
const state = require('./state');
const defaults = require('./defaults');
const isCli = require.main === module;
const cli = isCli ? require('commander') : null;
var config = {};

isCli && initCli();

function initCli () {
  cli
    .option('-f, --files [glob]', 'Files you would like to analyze', '**/*.*')
    .option('-t, --threshold [integer or floating point]', 'Specify the point at which you would like Towelie to fail')
    .option('-l, --lines [integer]', 'Minimum number of lines a block must have to be compared')
    .option('-c, --chars [integer]', 'Minimum number of characters a block must have to be compared')
    .option('-b, --boring', 'Don\'t show TWLY picture on run')
    .option('-t, --trc', 'Path to TWLY config file')
    .parse(process.argv);
  // Length of three indicates only one arg passed, which we assume is a glob
  let glob = process.argv.length === 3 ? process.argv[2] : cli.files;
  let runtimeConf = { files: glob };

  if (!cli.boring) { console.log(chalk.green(require('./assets/towelie'))); }
  // CLI arguments take precedence over config file, since they are "closer" to runtime
  if (cli.threshold) { runtimeConf.threshold = cli.threshold; }
  if (cli.lines) { runtimeConf.minLines = cli.lines; }
  if (cli.chars) { runtimeConf.minChars = cli.chars; }

  run(runtimeConf);
}

// TODO: If config.files is an array, then we want to iterate over that array and do a run for each. Targets is better name, though.
// This application has 3 basic stages: (1) read files, (2) compare their contents, and (3) report TWLY's findings. 
function run (runtimeConf = {}) {
  config = (require('./config'))(runtimeConf);
  return read(config.files, config)
    .then(docs => compare(docs))
    .then(messages => report(messages))
    .catch(err => { throw err; });
}

function read (pathsToRead, config) {
  return new Promise((resolve, reject) => {
    let docs = [];

    glob(path.join(process.cwd(), pathsToRead), config, (err, paths) => {
      paths.forEach((filePath, i) => {
        fs.readFile(filePath, (err, data) => {
          if (err) { console.log(chalk.red(`Error reading file "${filePath}"`)); throw err; }

          let content = data.toString();
          state.totalFiles++;
          state.totalLines += numLines(content);
          docs.push({ content, filePath });
          if (docs.length === paths.length) { resolve(docs); }
        });
      });
    });
  });
}

function compare (docs) {
  let messages = [];
  let fullDocHashes = new Map();
  let allBlockHashes = new Map(); 

  for (let i = 0; i < docs.length; i++) {
    let docHash = hashString(minify(docs[i].content));
    /*
      We check if the hash of ALL of the minified content in current document already exists in our array of hashes
      If it does, that means we have a duplicate of an entire document, so we check to see if there is a message with
      that hash as a reference, and if there is then we add the docpath to the message... otherwise just add message
    */
    let fullDocMatched = fullDocHashes.has(docHash);
    if (!fullDocMatched) {
      fullDocHashes.set(docHash, { docInd: i });
    } else {
      handleDocMatch(i, docHash, fullDocHashes, docs, messages);
      state.dupedLines += numLines(docs[i].content);
      state.numFileDupes++;
      continue;
    }
    // If the file being examined is not a text file, we want to evaluate only it's full signature
    if (!isTextFile(docs[i].filePath)) { continue; }
    /*
      If we don't continue here when fullDocMatched, then we will start matching the blocks of files which are pure duplicates
      However, if we do continue, then if a different file shares a fragment with the current file, we will not realize.
      The solution might be to not continue here, but skip blocks who have hashes that map files which are perfect duplicates,
      so check below at match time... a duplicate message will have already been created. Related to: https://github.com/rdgd/twly/issues/4
    */

    let blocks = makeBlockArray(docs[i].content);
    let minifiedBlocks = minifyBlocks(blocks);
    // We iterate over the current document's minified blocks
    for (let b = 0; b < minifiedBlocks.length; b++) {
      if (!meetsSizeCriteria(blocks[b], (config.minLines - 1), config.minChars)) { continue; }
      // First we must check if this block is even worth checking, as we have config params which set some criteria for the content size
      let blockHash = hashString(minifiedBlocks[b]);
      let blockMatched = allBlockHashes.has(blockHash);
      if (!blockMatched) {
        allBlockHashes.set(blockHash, { docInd: fullDocHashes.get(docHash).docInd }); 
      } else {
        let block = blocks[b];
        let docInd = allBlockHashes.get(blockHash).docInd;
        let msg = handleBlockMatch(docs[i].filePath, docs[docInd].filePath, block, blockHash, docInd, docs, messages);

        state.dupedLines += numLines(block);
        state.numBlockDupes++;

        if (msg) {
          if (msg.file) { // Using this k => v existence as predicate doesn't sit right
            msg.duplicateMsg.docs.push(msg.file);
          } else if (msg.block) { // Using this k => v existence as predicate doesn't sit right
            msg.duplicateMsg.content.push(msg.block);
            msg.duplicateMsg.hashes.push(msg.blockHash);
          } else {
            messages.push(msg);
            if (msg.type === constants.INTRA_FILE_DUPLICATE) { state.numBlockDupesInFile++; }
          }
        }
      }
    }
  }

  return messages;
}

// Returns a new message OR modifies an existing message
function handleBlockMatch (file1, file2, block, blockHash, docInd, docs, messages) {
  let inSameFile = file1 === file2;
  let dupeMsgInd = messageIndexByHash(blockHash, messages);
  let duplicateMsg = messages[dupeMsgInd];
  let firstTimeMatched = dupeMsgInd === -1;
  let priorFileDupes = messageIndexByFiles([file1, file2], messages) !== -1;

  if (inSameFile) { return new Message([file1], constants.INTRA_FILE_DUPLICATE, blockHash, block); } // TODO: Add count for number of times repeated in the same file
  if (!inSameFile && firstTimeMatched && !priorFileDupes) { return new Message([file1, file2], constants.INTER_FILE_DUPLICATE, blockHash, block); }

  if (!inSameFile && !firstTimeMatched) {
    // This is also an 'inter-file duplicate' scenario
    let duplicateMsg = messages[dupeMsgInd];
    let alreadyReportedByCurrentFile = duplicateMsg.docs.indexOf(file1) > -1;
    if (!alreadyReportedByCurrentFile) {
      return { duplicateMsg: duplicateMsg, file: file1 };
    }
  }

  if (!inSameFile && firstTimeMatched && priorFileDupes) {
    /*
      Need to figure out if there is a message with the same files for a message we are about to write,
      and if so, add the content to that message. TODO: We also need to be able to add that content's hash to an array
      of hashes instead of just a single hash so that we can pick up duplicate content still.
    */
    return  { duplicateMsg, block, blockHash };
  }
}

function handleDocMatch (i, docHash, fullDocHashes, docs, messages) {
  let existingMsgInd = fullDocHashes.get(docHash).msgInd;
  let previouslyMatched = existingMsgInd > -1;
  if (previouslyMatched) {
    let msg = messages[existingMsgInd];
    (msg.docs.indexOf(docs[i].filePath) === -1) && msg.docs.push(docs[i].filePath);
  } else {
    // msgInd is a way to point to a "message" related to a hash, which is faster than iterating over all messages looking for a hash
    fullDocHashes.get(docHash).msgInd = messages.length;
    messages.push(new Message([docs[i].filePath, docs[fullDocHashes.get(docHash).docInd].filePath], constants.IDENTICAL_FILE, docHash));
  }
}

function report (messages) {
  state.numFileDupes = state.numFileDupes === 0 ? state.numFileDupes : (state.numFileDupes + 1);
  let r = new Report(state, messages, config.failureThreshold);

  config.logLevel === 'REPORT' && r.log(config.exitOnFailure);
  return r;
}

// Utility functions used throughout the above code ^^^
function messageIndexByHash (hash, msgs) {
  let dupeInd = -1;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].hashes && msgs[i].hashes.indexOf(hash) > -1) {
      dupeInd = i;
      break;
    }
  }

  return dupeInd;
}

function messageIndexByFiles (files, msgs) {
  let ind = -1;

  for (let m = 0; m < msgs.length; m++) {
    let hasAllFiles = files.filter((file) => msgs[m].docs.indexOf(file) > -1).length === files.length;
    if (hasAllFiles) { ind = m; break; }
  }
  return ind;
}

function hasMoreNewlinesThan (p, n, eq) {
  let matches = p.match(/\n/g);
  return eq ? (matches && matches.length + 1 >= n) : (matches && matches.length + 1 > n);
}

function numLines (s) {
  let matches = s.match(/\n/g);
  return matches ? matches.length + 1 : 0;
}

function meetsSizeCriteria (p, minLines, minChars) {
  return hasMoreNewlinesThan(p, minLines, true) && p.length > minChars;
}

function hashString (s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function makeBlockArray (s) {
  return removeEmpty(s.split('\n\n'));
}

function minifyBlocks (arr) {
  return removeEmpty(arr).map(minify);
}

function removeEmpty (arr) {
  return arr.filter(function (arr) { return arr !== ''; });
}

function minify (s) {
  return s.replace(/(\n|\s|\t)/g, '');
}

function isTextFile (filePath) {
   return !binaries.includes(filePath.split('.').pop());
}

module.exports = run;
