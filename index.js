#!/usr/bin/env node
'use strict';

require('console.table');
var crypto = require('crypto');
var fs = require('fs');
var chalk = require('chalk');
var glob = require('glob');
var path = require('path');

var Message = require('./message');
var state = require('./state');
var config = require('./config');
var towelie = require('./assets/towelie');

init();

function init () {
  // We show towelie picture for fun
  console.log(chalk.green(towelie));
  // We expect the glob argument to ALWAYS be the first argument 
  let glob = process.argv[2];
  if(!glob) { glob = '**/*.*'; }

  /*
    This application has 4 different stages: (1) configure (2) read (3) compare the contents
    and (4) report towlie's findings. In stage 2, read, we pass in the global variable "config", required above, 
    otherwise we are just piping functions
  */
  configure()
    .then(function (config) { return read(glob.toString(), config); })
    .then(function (docs){ return compare(docs); })
    .then(function (messages){ return report(messages); })
    .catch(function (err) { throw err; });
}

function configure () {
  return new Promise(function (resolve, reject) {
    // Attempt to read the .trc file, which is the designated name for a twly config file
    fs.readFile(process.cwd() + '/.trc', 'utf-8', function (err, data) {
      let o = { ignore: [] };
      if (err) {
        o.ignore = config.ignore;
      } else {
        // The required format of the config file is JSON
        let userConf = JSON.parse(data);
        let ignore = userConf.ignore;
        // If user supplied ignore values, we get their fully qualified paths and add them to ignore array
        ignore && ignore.forEach(function (p) { o.ignore.push(path.join(process.cwd(), p)); });
        // Checking for the existence of individual properties and copying over their values if they exist
        if (userConf.failureThreshold) { config.failureThreshold = userConf.failureThreshold; }
        if (userConf.minLines) { config.minLines = userConf.minLines; }
        if (userConf.minChars) { config.minChars = userConf.minChars; }
      }
      resolve(o);
    });
  });
}

function read (pathsToRead, config) {
  return new Promise(function (resolve, reject) {
    let docs = [];
    glob(path.join(process.cwd(), pathsToRead), config, function (err, paths) {
      paths.forEach(function (p, i) {

        /*
          Reading in all documents and only firing off the comparison once all have been read.
          This is signaled by invoking the promise's resolve function and passing it an array of documents. 
        */
        fs.readFile(p, function (err, data) {
          if (err) { throw err; }
          state.totalFiles++;
          state.totalLines += numLines(data.toString());
          docs.push({ content: data.toString(), filePath: p, pi: i });
          if (docs.length === paths.length) { resolve(docs); }
        });
      });
    });
  });
}

function compare (docs) {
  let messages = [];
  let fullDocHashes = {};
  let allBlockHashes = {};

  for (let i = 0; i < docs.length; i++) {
    let iPOriginal = removeEmpty(makeParagraphArray(docs[i].content));
    let iP = normalize(iPOriginal);
    let hash = hashString(minify(docs[i].content));

    /*
      We check if the hash of ALL of the minified content in current document already exists in our array of hashes
      If it does, that means we have a duplicate of an entire document, so we check to see if there is a message with 
      that hash as a reference, and if there is then we add the docpath to the message... otherwise just add message
    */
    if (hash in fullDocHashes) {
      let existingMsgInd = fullDocHashes[hash].msgInd;
      if (existingMsgInd) {
        messages[existingMsgInd].docs.push(docs[i].filePath);
      } else {
        // Sort of clever: before augmenting the length of the array by pushing to it, I am grabbing the current length for that index
        fullDocHashes[hash].msgInd = messages.length;
        messages.push(new Message([docs[i].filePath, docs[fullDocHashes[hash].ind].filePath], 0, ''));
      }
      // Increment the relevant counters for reporting
      state.dupedLines += (numLines(docs[i].content) * 2);
      state.numFileDupes++;
      continue;
    }

    // We don't add to the hashes array above because no need for possible redundancy
    fullDocHashes[hash] = { ind: i };

    // We iterate over iP which is the current document's paragraphs
    for (let p = 0; p < iP.length; p++) {
      /*
        First we must check if this paragraph is even worth checking, as
        we have config params which set some criteria for the content size
      */
      if (!meetsSizeCriteria(iPOriginal[p], (config.minLines - 1), config.minChars)) { continue; }

      
      let pHash = hashString(iP[p]);
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
          messages.push(new Message([file1], 2, iPOriginal[p], pHash));
        } else if (dupeMsgInd === -1) { // <--- Dupe message not found
          messages.push(new Message([file1, file2], 1, iPOriginal[p], pHash));
        } else {
          /*
            If there was a match for paragraph hashes AND the paragraphs were NOT in the same file AND
            a message with current paragraph hash WAS FOUND THEN there are multiple files with the same 
            paragraph in them and we must add the filename to the files array of the pre-existing message
          */
          messages[dupeMsgInd].docs.push(file1);
        }

        inSameFile && state.numParagraphDupesInFile++;
        state.dupedLines += (numLines(iPOriginal[p]) * 2);
        state.numParagraphDupes++;
      } else {
        allBlockHashes[pHash] = hash;
      }
    }
  }
  /*
    We just return a value here instead of resolving a promise, because we are not in a promise and do not
    need one because the above operations are synchronous
  */
  return messages;
}

function report (messages) {
  let towelieScore = (100 - ((state.dupedLines / state.totalLines) *  100)).toFixed(2);
  /*
    We want the full file duplicates at the bottom so that full aggregiousness is realized,
    so we sort the messages array based on message.type which is an int
  */
  messages.sort(function (a, b) {
    if (a.type > b.type) { return -1; }
    if (a.type < b.type) { return 1; }
    return 0;
  }).forEach(function (msg) {
    // This is where we print the individual violations "messages"
    console.log(msg.toPlainEnglish());
  });

  // This is a tabular summary of some of the metrics taken throughout the process
  console.table([
    {
      "Files Analyzed": state.totalFiles,
      "Lines Analyzed": state.totalLines,
      "Duplicate Files": state.numFileDupes,
      "Duplicate Blocks": state.numParagraphDupes,
      "Duplicate Blocks Within Files": state.numParagraphDupesInFile
    }
  ]);

  // The end. How did you do?
  if (towelieScore < config.failureThreshold) {
    console.log(chalk.bgRed(`You failed your threshold of ${config.failureThreshold}% with a score of ${towelieScore}%`));
    process.exitCode = 1;
  } else {
    console.log(chalk.bgGreen(`You passed your threshold of ${config.failureThreshold}% with a score of ${towelieScore}%`));
  }
}

// Utility functions used throughout the above code ^^^
function findDuplicateMsgInd (hash, msgs) {
  let dupeInd = -1;
  for (let i = 0; i < msgs.length; i++) {
    if (hash === msgs[i].hash) {
      dupeInd = i;
      break;
    }
  }

  return dupeInd;
}

function updateDuplicateMsg (hash, content, msgs) {
  msgs.map(function (msg) {
    if (msg.hash === hash) { msg.content.push(content); }
    return msg;
  });
}

function hasMoreNewlinesThan (p, n, eq) {
  let matches = p.match(/\n/g);
  return eq ? (matches && matches.length >= n) : (matches && matches.length > n);
}

function numLines (s) {
  let matches = s.match(/n/g);
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
  return s.replace(/(\n|\s)/g, '');
}