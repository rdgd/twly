/*
  1. Take glob input for files.
  2. ASCII art, 1337h4x02
  3. Read config file
*/

var fs = require('fs');
var chalk = require('chalk');
var towelie = require('./towelie');
console.log(towelie);

var docPaths = ['/docs/doc1.txt', '/docs/doc2.txt', '/docs/doc3.txt', '/docs/doc4.txt'];
var docs = [];
var messages = [];

docPaths.forEach(function (docPath, i) {
  fs.readFile(__dirname + docPath, function (err, data) {
    if (!err) { docs.push({ content: data.toString(), filePath: docPath, pi: i }); }
    if (docs.length === docPaths.length) { compareDocs(docs); }
  });
});

function compareDocs (docs) {
  for (var i = 0; i < docs.length; i++) {
    var iPOriginal = removeEmpty(docs[i].content.split('\n\n'));
    var iP = normalize(iPOriginal);
    
    for (var x = 0; x < docs.length; x++) {
      var xPOriginal = removeEmpty(docs[x].content.split('\n\n'));
      var xP = normalize(xPOriginal);

      if (i === x) { continue; }
      // First let's check for total equality
      if (docs[i].content === docs[x].content) {
        messages.push(`Docs ${chalk.blue(docs[i].filePath)} and ${chalk.blue(docs[x].filePath)} are ${chalk.red('identical')}!`);
        //docPaths = docPaths.filter(function (value, ind) { return ind !== docs[i].pi && ind !== docs[x].pi; });
        //docs = docs.filter(function (v, ind) { return ind !== i && ind !== x; });
        continue;
      }

      // Check for paragraph-level equality
      for (let y = 0; y < iP.length; y++) {
        for (let z = 0; z < xP.length; z++) {
          if (iP[y] === xP[z]) {
            messages.push(`Docs ${chalk.blue(docs[i].filePath)} and ${chalk.blue(docs[x].filePath)} repeat the following: \n\n\t ${chalk.red(iPOriginal[y])}`);
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
}