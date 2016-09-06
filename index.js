#!/usr/bin/env node
'use strict';

var fs = require('fs');
require('console.table');
var chalk = require('chalk');
var towelie = require('./assets/towelie');
var glob = require('glob');
var path = require('path');
var Message = require('./message.js');

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
    glob(path.join(process.cwd(), pathsToRead), function (err, paths){
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
  var messages = [];
  // i represents the "root document"
  for (var i = 0; i < docs.length; i++) {
    var iPOriginal = removeEmpty(docs[i].content.split('\n\n'));
    var iP = normalize(iPOriginal);

    /*
      Check the root document for repeat content within itself. After iterating through all
      of iP (root document's paragraphs'), we will have checked every document against itself. 
    */
    for (var x = 0; x < iP.length; x++) {
      var isDupe = false;
      for (var m = 0; m < messages.length; m++) {
        isDupe = iP[x] === normalize(messages[m].content)[0];
        if (isDupe) { break; }
      }

      if (isDupe || !hasMoreNewlinesThan(iPOriginal[x], 3, true) || !isLongEnough(iP[x])) { continue; }

      // If the content isn't recorded in a message somewhere ^^^, then test to see if it duplicates other content
      for (var y = 0; y < iP.length; y++) {
        if (x === y) { continue; }
        if (iP[x] === iP[y]) {
          dupedLines += (numLines(iP[x]) * 2);
          numParagraphDupes++;
          numParagraphDupesInFile++;
          messages.push(new Message([docs[i].filePath], 2, iPOriginal[x]));
          break;
        }
      }
    }

    // x represents the "comparison document"
    for (var x = 0; x < docs.length; x++) {
      var xPOriginal = removeEmpty(docs[x].content.split('\n\n'));
      var xP = normalize(xPOriginal);

      if (i === x) { continue; }
      // Check for total equality. If equal, then no reason to compare at a deeper level.
      if (docs[i].content === docs[x].content) {
        dupedLines += (numLines(docs[i].content) * 2);
        numFileDupes++;
        messages.push(new Message([docs[i].filePath, docs[x].filePath], 0));
        continue;
      }

      /*
        Check for paragraph-level equality by iterating over the "root document" paragraphs (y), 
        and for each paragraph iterating over the current "comparison document" paragraphs (z)
      */
      for (let y = 0; y < iP.length; y++) {
        if(!hasMoreNewlinesThan(iPOriginal[y], 3, true) || !isLongEnough(iP[y])) { continue; }

        for (let z = 0; z < xP.length; z++) {
          if (iP[y] === xP[z]) {
            var isRepeat = -1;
            var isDupe = false;
            messages.forEach(function (msg, ind) {
              if (msg.docs.indexOf(docs[i].filePath) > -1 && msg.docs.indexOf(docs[x].filePath) > -1) {
                isRepeat = ind;
                isDupe = msg.content.indexOf(iPOriginal[y]) !== -1;
              }
            });

           if (isDupe) {
             continue;
           } else if (isRepeat !== -1) {
             messages[isRepeat].content.push(iPOriginal[y]);
           } else {
              dupedLines += (numLines(iPOriginal[y]) * 2);
              numParagraphDupes++;
              messages.push(new Message([docs[i].filePath, docs[x].filePath], 1, iPOriginal[y]));
            }
          }
        }
      }
    }
  }

  return messages;
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

function report (messages) {
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
      "Duplicate Blocks in File": numParagraphDupesInFile
    }
  ]);

  console.log(`Towelie score: ${ (100 - ((dupedLines / totalLines) *  100)).toFixed(2) }% `);
}