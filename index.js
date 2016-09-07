#!/usr/bin/env node
'use strict';

require('console.table');
var crypto = require('crypto');
var fs = require('fs');
var chalk = require('chalk');
var towelie = require('./assets/towelie');
var glob = require('glob');
var path = require('path');
var Message = require('./message.js');

// Config
var failureThreshold = 95;

// Global stuff for reporting
var totalLines = 0;
var dupedLines = 0;
var totalFiles = 0;
var numFileDupes = 0;
var numParagraphDupes = 0;
var numParagraphDupesInFile = 0;

init();

function init () {
  console.log(chalk.green(towelie));
  let glob = process.argv[2];
  if(!glob) { throw 'You must pass a glob of files you want to analyze.' }
  // The procedure is to (1) read (2) compare the contents and (3) report towlie's findings
  read(glob.toString())
    .then(function (docs){ return compare(docs); })
    .then(function (messages){ return report(messages); })
    .catch(function (err) { throw err; });
}

function read (pathsToRead) {
  // Reading in all documents and only beginning the comparison once all have been read into memory
  return new Promise(function (resolve, reject){
    var docs = [];
    glob(path.join(process.cwd(), pathsToRead), { ignore: path.join(process.cwd(), 'node_modules/**/*.*') }, function (err, paths){
      paths.forEach(function (p, i) {
        fs.readFile(p, function (err, data) {
          if (err) { throw err; }
          totalFiles++;
          totalLines += numLines(data.toString());
          docs.push({ content: data.toString(), filePath: p, pi: i });
          if (docs.length === paths.length) {
            resolve(docs);
          }
        });
      });
    });
  });
}

function compare (docs) {
  let messages = [];
  let fullDocHashes = {};
  let allBlockHashes = {};
  // i represents the "root document"
  for (let i = 0; i < docs.length; i++) {
    let iPOriginal = removeEmpty(makeParagraphArray(docs[i].content));
    let iP = normalize(iPOriginal);
    let hash = hashString(minify(docs[i].content));

    // We can continue here because the first time the identical document comes through, its contents will be compared with all others
    if (hash in fullDocHashes) {
      dupedLines += (numLines(docs[i].content) * 2);
      numFileDupes++;
      messages.push(new Message([docs[i].filePath, docs[fullDocHashes[hash]].filePath], 0, ''));
      continue;
    }

    fullDocHashes[hash] = i;

    for (let p = 0; p < iP.length; p++) {
      if (!isGreatEnoughSize(iPOriginal[p])) { continue; }
      let pHash = hashString(iP[p]);
      if (pHash in allBlockHashes) {
        let file1 = docs[i].filePath;
        let file2 = docs[fullDocHashes[allBlockHashes[pHash]]].filePath;
        dupedLines += (numLines(iPOriginal[p]) * 2);
        numParagraphDupes++;
        if (file1 === file2) {
          numParagraphDupesInFile++;
          messages.push(new Message([file1], 2, iPOriginal[p], pHash));
        } else {
          messages.push(new Message([file1, file2], 1, iPOriginal[p], pHash));
        }
      } else {
        allBlockHashes[pHash] = hash;
      }
    }
  }

  return messages;
}

function hasDuplicateMsg (hash, msgs) {
  let isDupe = false;
  msgs.forEach(function (msg, ind) {
    isDupe = hash === msg.hash;
    if (isDupe) { return isDupe; }
  });
}

function updateDuplicateMsg (hash, content, msgs) {
  msgs.map(function (msg) {
    if (msg.hash === hash) { msg.content.push(content); }
    return msg;
  });
}

function isGreatEnoughSize (p) {
  return hasMoreNewlinesThan(p, 3, true) && isLongEnough(p);
}

function hashString (s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function makeParagraphArray (s) {
  return s.split('\n\n');
}

function isLongEnough (p) {
  let minRepeatContentLength = 100;
  return p.length > minRepeatContentLength;
}

function hasMoreNewlinesThan (p, n, eq) {
  let matches = p.match(/\n/g);
  return eq ? (matches && matches.length >= n) : (matches && matches.length > n);
}

function numLines (s) {
  let matches = s.match(/n/g);
  return matches ? matches.length : 0; 
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

function report (messages) {
  let towelieScore = (100 - ((dupedLines / totalLines) *  100)).toFixed(2);
  messages.sort(function (a, b) {
    if (a.type > b.type) { return -1; }
    if (a.type < b.type) { return 1; }
    return 0;
  }).forEach(function (msg) {
    console.log(msg.toPlainEnglish());
  });

  console.table([
    {
      "Files Analyzed": totalFiles,
      "Lines Analyzed": totalLines,
      "Duplicate Files": numFileDupes,
      "Duplicate Blocks": numParagraphDupes,
      "Duplicate Blocks Within Files": numParagraphDupesInFile
    }
  ]);

  console.log(`Towelie score: ${ towelieScore }% `);
  if (towelieScore < failureThreshold) {
    process.exitCode = 1;
  }
}