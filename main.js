#!/usr/bin/env node

var fs = require('fs');
var chalk = require('chalk');
var towelie = require('./towelie');
var cli = require('commander');
var glob = require('glob');
var path = require('path');
var docPath = process.argv[2].toString();
var docPaths;
var docs = [];
var messages = [];
// Reading in all documents and only beginning the comparison once all have been read into memory
glob(path.join(process.cwd(), docPath), function (err, paths){
  docPaths = paths;
  docPaths.forEach(function (docPath, i) {
    fs.readFile(docPath, function (err, data) {
      console.log(docPath);
      if (!err) { docs.push({ content: data.toString(), filePath: docPath, pi: i }); }
      if (docs.length === docPaths.length) { compareDocs(docs); }
    });
  });
});

console.log(chalk.green(towelie));

function compareDocs (docs) {
  console.log(docPaths);
  // i represents the "root document"
  for (var i = 0; i < docs.length; i++) {
    var iPOriginal = removeEmpty(docs[i].content.split('\n\n'));
    var iP = normalize(iPOriginal);
    // x represents the "comparison document"
    for (var x = 0; x < docs.length; x++) {
      var xPOriginal = removeEmpty(docs[x].content.split('\n\n'));
      var xP = normalize(xPOriginal);

      if (i === x) { continue; }
      // First let's check for total equality. If equal, then no reason to compare at a deeper level.
      if (docs[i].content === docs[x].content) {
        messages.push(`Docs ${chalk.yellow(docs[i].filePath)} and ${chalk.yellow(docs[x].filePath)} are ${chalk.red('identical')}! ${chalk.bgYellow(chalk.blue('W') + chalk.cyan('T') + chalk.green('F'))} ${chalk.bgRed('!!!')}`);
        continue;
      }

      /*
        Check for paragraph-level equality by iterating over the "root document" paragraphs (y), 
        and for each paragraph iterating over the current "comparison document" paragraphs (z)
      */
      for (let y = 0; y < iP.length; y++) {
        for (let z = 0; z < xP.length; z++) {
          if (iP[y] === xP[z]) {
            messages.push(`Docs ${chalk.yellow(docs[i].filePath)} and ${chalk.yellow(docs[x].filePath)} repeat the following: \n\n\t ${chalk.red(iPOriginal[y])} \n`);
          }
        }
      }
    }
  }
  
  report(messages);
}

function normalize (arr) {
  return removeEmpty(arr).map(function (s) { return s.replace(/\s/g, ''); });
}

function removeEmpty (arr) {
  return arr.filter(function (arr) { return arr !== ''; });
}

function report (messages) {
  messages.forEach(function (msg) { console.log(msg); });
  chalk.green(`Towelie says, don't forget your towel when you get out of the pool`);
  chalk.red(`Towelie found ${messages.length} violations!`);
}