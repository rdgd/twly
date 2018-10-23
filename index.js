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
const defaults = require('./defaults');
const isCli = require.main === module;
const cli = isCli ? require('commander') : null;

isCli && initCli();

function initCli () {
  cli
    .option('-b, --boring', 'Don\'t show TWLY picture on run')
    .option('-c, --chars [integer]', 'Minimum number of characters a block must have to be compared')
    .option('-f, --files [glob]', 'Files you would like to analyze', '**/*.*')
    .option('-l, --lines [integer]', 'Minimum number of lines a block must have to be compared')
    .option('-t, --trc [string]', 'Path to TWLY config file')
    .option('-T, --threshold [integer or floating point]', 'Specify the point at which you would like Towelie to fail')
    .parse(process.argv);
  // Length of three indicates only one arg passed, which we assume is a glob
  let glob = process.argv.length === 3 ? process.argv[2] : cli.files;
  let runtimeConf = { files: glob };

  if (!cli.boring) { console.log(chalk.green(require('./assets/towelie'))); }
  // CLI arguments take precedence over config file, since they are "closer" to runtime
  if (cli.threshold) { runtimeConf.threshold = cli.threshold; }
  if (cli.lines) { runtimeConf.minLines = cli.lines; }
  if (cli.chars) { runtimeConf.minChars = cli.chars; }
  if (cli.trc) { runtimeConf.trc = cli.trc; }

  run(runtimeConf);
}

// TODO: If config.files is an array, then we want to iterate over that array and do a run for each. Targets is better name, though.
// This application has 3 basic stages: (1) read files, (2) compare their contents, and (3) report TWLY's findings.
function run (runtimeConf = {}) {
  let state = require('./state');
  const config = (require('./config'))(runtimeConf);
  return read(config.files, config, state)
    .then(docs => compare(docs, config, state))
    .then(messages => report(messages, config, state))
    .catch(err => { throw err; });
}

function read (pathsToRead, config, state) {
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

function compare (docs, config, state) {
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
      let existingMsgInd = fullDocHashes.get(docHash).msgInd;
      let previouslyMatched = existingMsgInd > -1;
      if (previouslyMatched) {
        let msg = messages[existingMsgInd];
        (!msg.docs.includes(docs[i].filePath)) && msg.docs.push(docs[i].filePath);
      } else {
        // msgInd is a way to point to a "message" related to a hash, which is faster than iterating over all messages looking for a hash
        fullDocHashes.get(docHash).msgInd = messages.length;
        messages.push(new Message([docs[i].filePath, docs[fullDocHashes.get(docHash).docInd].filePath], constants.IDENTICAL_FILE, docHash));
      }
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
      let currentDocInd = fullDocHashes.get(docHash).docInd;
      if (!blockMatched) {
        allBlockHashes.set(blockHash, { docIndexes: [currentDocInd] });
      } else {
        let block = blocks[b];
        state.dupedLines += numLines(block);
        state.numBlockDupes++;

        let docIndexes = allBlockHashes.get(blockHash).docIndexes;
        let currentDoc = docs[i].filePath;
        let matchedDocs = docIndexes.map(di => docs[di]);
        let matchedDocFilePaths = matchedDocs.map(di => di.filePath);
        let isIntraFileDupe = matchedDocs.includes(docs[i]);

        if (!isIntraFileDupe) {
          docIndexes.push(fullDocHashes.get(docHash).docInd);
        } else { // TODO: Add count for number of times repeated in the same file
          let di = intraFileDupeInd(currentDoc, messages);
          if (di === -1) {
            messages.push(new Message([currentDoc], constants.INTRA_FILE_DUPLICATE, blockHash, block));
          } else {
            messages[di].content.push(block);
          }
          continue;
        }

        let dupeBlockMsgIndexes = interFileDupeMsgIndexesByHash(blockHash, messages);
        let dupeFileMsgInd = messageIndexByFiles(matchedDocFilePaths, messages);

        let firstTimeBlockHasMatched = dupeBlockMsgIndexes.length === 0;
        let firstTimeFilesHaveMatchingBlock = dupeFileMsgInd === -1;

        if (firstTimeBlockHasMatched) {
          messages.push(new Message(matchedDocFilePaths.concat(currentDoc), constants.INTER_FILE_DUPLICATE, blockHash, block));
        } else {
          dupeBlockMsgIndexes.forEach((i) => {
            let alreadyReportedByCurrentFile = messages[i].docs.includes(currentDoc);
            if (!alreadyReportedByCurrentFile) {
              messages[i].docs.push(currentDoc);
            }
          });
        }
      }
    }
  }

  return combineMessages(messages);
}

function report (messages, config, state) {
  state.numFileDupes = state.numFileDupes === 0 ? state.numFileDupes : (state.numFileDupes + 1);
  let r = new Report(state, messages, config.threshold);

  config.logLevel === 'REPORT' && r.log(config.exitOnFailure);
  return r;
}

// Utility functions used throughout the above code ^^^
function combineMessages (messages) {
  let combinedMessages = [];
  messages.forEach((m) => {
    let matchedInd = -1;
    for (var i = 0; i < combinedMessages.length; i++) {
      if (combinedMessages[i].type !== constants.INTRA_FILE_DUPLICATE && new Set(m.docs.concat(combinedMessages[i].docs)).size === m.docs.length) {
        matchedInd = i; break;
      }
    }
    if (matchedInd !== -1) {
      combinedMessages[matchedInd].content.push(m.content);
    } else {
      combinedMessages.push(m);
    }
  });
  return combinedMessages;
}

function intraFileDupeInd (file1, msgs) {
  let dupeInd = -1;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].type === constants.INTRA_FILE_DUPLICATE && msgs[i].docs.includes(file1)) {
      dupeInd = i;
      break;
    }
  }
  return dupeInd;
}

function interFileDupeMsgIndexesByHash (hash, msgs) {
  let dupeInd = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].hashes && msgs[i].hashes.includes(hash) && msgs[i].type === constants.INTER_FILE_DUPLICATE) {
      dupeInd.push(i);
    }
  }

  return dupeInd;
}

function messageIndexByFiles (files, msgs) {
  let ind = -1;

  for (let m = 0; m < msgs.length; m++) {
    let hasAllFiles = msgs[m].docs.length === files.length && files.filter((file) => msgs[m].docs.includes(file));
    if (hasAllFiles) {
      ind = m;
      break;
    }
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
