const Message = require('../message');
const constants = require('../constants');
const stripAnsi = require('strip-ansi');

const hash1 = '3858f62230ac3c915f300c664312c63';
const hash2 = '58f63930a22c30op5g770d32432254z'

function normalize (txt) {
  return stripAnsi(txt).trim();
}

test('Identical file message', () => {
  let content = 'My content is here!';
  let msg = new Message(['file1.js', 'file2.js'], constants.IDENTICAL_FILE, hash1, content);
  let english = normalize(msg.toPlainEnglish());
  expect(english).toContain('file1.js and file2.js are IDENTICAL WTF !!!');
  expect(english).toContain(content);
});

test('Intra-file duplicate message', () => {
  let content = 'I repeated this in myself';
  let msg = new Message(['file1.js'], constants.INTRA_FILE_DUPLICATE, hash1, content);
  let english = normalize(msg.toPlainEnglish());
  expect(english).toContain('file1.js, repeats the following within the file:');
  expect(english).toContain(content);
});

test('Inter-file duplicate message', () => {
  let content = 'This was repeated in different files';
  let msg = new Message(['file1.js', 'file2.js'], constants.INTER_FILE_DUPLICATE, hash1, content);
  let english = normalize(msg.toPlainEnglish());
  expect(english).toContain('file1.js and file2.js repeat the following:');
  expect(english).toContain(content);
});