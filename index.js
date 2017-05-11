#!/usr/bin/env node
'use strict';

const cli = require('commander');
const crypto = require('crypto');
const fs = require('fs');
const chalk = require('chalk');
const glob = require('glob');
const path = require('path');
const binaries = require('binary-extensions');

const Message = require('./message');
const Report = require('./report.js');
const state = require('./state');
const config = require('./config');
const towelie = require('./assets/towelie');
const isCli = require.main === module;

cli
  .option('-f, --files [glob]', 'Files you would like to analyze', '**/*.*')
  .option('-t, --threshold [integer or floating point]', 'Specify the point at which you would like Towelie to fail')
  .option('-l, --lines [integer]', 'Minimum number of lines a block must have to be compared')
  .option('-c, --chars [integer]', 'Minimum number of characters a block must have to be compared')
  .option('-b, --boring', 'Don\'t show TWLY picture on run')
  .parse(process.argv);

isCli && initCli();

function initCli () {
  // Length of three indicates that only one arg passed. All of our options require values, so we assume then it was a glob.
  let glob = process.argv.length === 3 ? process.argv[2] : cli.files;
  // We show towelie picture for fun
  !cli.boring && console.log(chalk.green(towelie));

  main(glob);
}

function main (conf) {
  let glb;
  // When using TWLY programatically, a config object will be passed. Otherwise, the argument will be a file path or glob.
  if (typeof conf === "object") {
    glb = conf.files; // If files is an array, then we want to iterate over that array and do a run for each. Targets is better name, though.
    Object.assign(config, conf);
  } else {
    glb = conf; // In this case the variable name conf is misleading, it's actually assumed that the value is a glob since it's not an object.
  }

  /*
    This application has 4 different stages: (1) configure (2) read (3) compare the contents
    and (4) report towlie's findings. In stage 2, read, we pass in the global variable "config", required above,
    otherwise we are just piping functions.
  */
  return configure()
    .then(config => read(glb.toString(), config))
    .then(docs => compare(docs))
    .then(messages => report(messages))
    .catch((err) => { throw err; });
}

function configure () {
  return new Promise((resolve, reject) => {
    // Attempt to read the .trc file, which is the designated name for a twly config file
    fs.readFile(process.cwd() + '/.trc', 'utf-8', (err, data) => {
      let o = { ignore: [] };

      function addIgnoreGlobs (p) { o.ignore.push(path.join(process.cwd(), p)); } // I don't like the side affects here, do something better.

      if (err) {
        o = config;
      } else {
        // The required format of the config file is JSON
        let userConf = JSON.parse(data);
        let ignore = userConf.ignore;
        // If user supplied ignore values, we get their fully qualified paths and add them to ignore array
        ignore && ignore.forEach(addIgnoreGlobs);
        /*
          Checking for the existence of individual properties and copying over their values if they exist
          Giving preference to values defined via CLI
        */
        if (userConf.failureThreshold) { config.failureThreshold = userConf.failureThreshold; }
        if (userConf.minLines) { config.minLines = userConf.minLines; }
        if (userConf.minChars) { config.minChars = userConf.minChars; }
      }

      // CLI arguments take precedence over config file, since they are "closer" to runtime
      if (cli.threshold) { config.failureThreshold = cli.threshold; }
      if (cli.lines) { config.minLines = cli.lines; }
      if (cli.chars) { config.minChars = cli.chars; }

      resolve(o);
    });
  });
}

function read (pathsToRead, config) {
  return new Promise((resolve, reject) => {
    let docs = [];

    glob(path.join(process.cwd(), pathsToRead), config, (err, paths) => {
      paths.forEach((p, i) => {

        /*
          Reading in all documents and only firing off the comparison once all have been read.
          This is signaled by invoking the promise's resolve function and passing it an array of documents.
        */
        fs.readFile(p, (err, data) => {
          if (err) {
            console.log(chalk.red(`Error reading file "${p}"`))
            throw err;
          }
          let txt = data.toString();
          state.totalFiles++;
          state.totalLines += numLines(txt);
          docs.push({ content: txt, filePath: p, pi: i }); // Why leave pi hanging around? Doesn't seem to be used.
          if (docs.length === paths.length) { resolve(docs); }
        });
      });
    });
  });
}

// Break this into smaller functions... it's a bit unwieldy.
function compare (docs) {
  let messages = [];
  let fullDocHashes = {};
  let allBlockHashes = {};

  for (let i = 0; i < docs.length; i++) {
    let paragraphs = removeEmpty(makeParagraphArray(docs[i].content));
    let minifiedParagraphs = normalize(paragraphs);
    let hash = hashString(minify(docs[i].content));

    /*
      We check if the hash of ALL of the minified content in current document already exists in our array of hashes
      If it does, that means we have a duplicate of an entire document, so we check to see if there is a message with
      that hash as a reference, and if there is then we add the docpath to the message... otherwise just add message
    */
    if (hash in fullDocHashes) {
      let existingMsgInd = fullDocHashes[hash].msgInd;
      if (existingMsgInd >= 0) {
        let msg = messages[existingMsgInd];
        (msg.docs.indexOf(docs[i].filePath) === -1) && msg.docs.push(docs[i].filePath);
      } else {
        // Before augmenting the length of the array by pushing to it, I am grabbing the current length for that index
        fullDocHashes[hash].msgInd = messages.length;
        messages.push(new Message([docs[i].filePath, docs[fullDocHashes[hash].ind].filePath], 0, '', hash));
      }
      // Increment the relevant counters for reporting
      state.dupedLines += numLines(docs[i].content);
      state.numFileDupes++;
      /*
        If we don't continue here, then we will start matching the paragraphs of files which are pure duplicates
        However, if we do continue, then if a different file shares a fragment with the current file, we will not realize.
        The solution might be to not continue here, but skip blocks who have hashes that map files which are perfect duplicates,
        so check below at match time... a duplicate message will have already been created
      */
      continue;
    } else {
      // We don't add to the hashes array above because no need for possible redundancy
      fullDocHashes[hash] = { ind: i };
    }

    // If the file being examined is not a text file, we don't want to evaluate its contents, only it's full signature which we have done above
    if (!isTextFile(docs[i].filePath)) { continue; }

    // We iterate over the current document's minified paragraphs
    for (let p = 0; p < minifiedParagraphs.length; p++) {
      // First we must check if this paragraph is even worth checking, as we have config params which set some criteria for the content size
      if (!meetsSizeCriteria(paragraphs[p], (config.minLines - 1), config.minChars)) { continue; }

      let pHash = hashString(minifiedParagraphs[p]);
      /*
        Checking if minified paragraph hash exists in array of all paragraph hashes. If it doesn't
        then we just add the hash to the global block/paragraph hash array. If it does then we need to know
        if it has simply been added there or also has a message associated with it.
      */
      if (pHash in allBlockHashes) {
        // Current file of main file loop
        let file1 = docs[i].filePath;
        // File which had a paragraph that was matched in the allBlockHashes array
        let file2 = docs[fullDocHashes[allBlockHashes[pHash]].ind].filePath;
        let inSameFile = file1 === file2;
        let dupeMsgInd = findDuplicateMsgInd(pHash, messages);

        if (inSameFile) {
          messages.push(new Message([file1], 2, paragraphs[p], pHash));
        } else if (dupeMsgInd === -1) { // <--- Dupe message NOT found
          /*
            Need to figure out if there is a message with the same files for a message we are about to write,
            and if so, add the content to that message. TODO We also need to be able to add that content's hash to an array
            of hashes instead of just a single hash so that we can pick up duplicate content still.
          */
          let dupeMsgInd = getMsgIndByFiles([file1, file2], messages);
          if (dupeMsgInd === -1) {
            messages.push(new Message([file1, file2], 1, paragraphs[p], pHash));
          } else {
            messages[dupeMsgInd].content.push(paragraphs[p]);
            messages[dupeMsgInd].hashes.push(pHash);
          }
        } else {
          let msg = messages[dupeMsgInd];
          /*
            If there was a match for paragraph hashes AND the paragraphs were NOT in the same file AND
            a message with current paragraph hash WAS FOUND THEN there are multiple files with the same
            paragraph in them and we must add the filename to the files array of the pre-existing message
          */
          (msg.docs.indexOf(file1) === -1) && msg.docs.push(file1);
        }

        inSameFile && state.numParagraphDupesInFile++;
        state.dupedLines += numLines(paragraphs[p]);
        state.numParagraphDupes++;
      } else {
        /*
          Assigning the value of the pHash in the index object to the document hash because we want to be able to look up the correct index
          for the doc in the docs array and to get that index we look at the full document hash index object with the document hash as its key
        */
        allBlockHashes[pHash] = hash;
      }
    }
  }

  return messages;
}

function report (messages) {
  state.numFileDupes = state.numFileDupes === 0 ? state.numFileDupes : (state.numFileDupes + 1); // da fuq?
  let r = new Report(state, messages, config.failureThreshold);

  // Why this funky condition?
  if ((isCli && config.logLevel === 'REPORT') || config.logLevel === 'REPORT') { r.log(config.exitOnFailure); }
  return r;
}

// Utility functions used throughout the above code ^^^
function findDuplicateMsgInd (hash, msgs) {
  let dupeInd = -1;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].hashes && msgs[i].hashes.indexOf(hash) > -1) {
      dupeInd = i;
      break;
    }
  }

  return dupeInd;
}

function getMsgIndByFiles (files, msgs) {
  let ind = -1;

  for (let m = 0; m < msgs.length; m++) {
    let hasAllFiles = false;
    files.forEach(function (file, f) {
      hasAllFiles = msgs[m].docs.indexOf(file) > -1;
    });
    if (hasAllFiles) { ind = m; break;}
  }
  return ind;
}

function hasMoreNewlinesThan (p, n, eq) {
  let matches = p.match(/\n/g);
  return eq ? (matches && matches.length >= n) : (matches && matches.length > n);
}

function numLines (s) {
  let matches = s.match(/\n/g);
  return matches ? matches.length : 0;
}

function meetsSizeCriteria (p, minLines, minChars) {
  return hasMoreNewlinesThan(p, minLines, true) && p.length > minChars;
}

function hashString (s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function makeParagraphArray (s) {
  return s.split('\n\n');
}

function normalize (arr) {
  return removeEmpty(arr).map(function (s) { return s.replace(/\s/g, ''); });
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

module.exports = main;
