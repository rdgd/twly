const rewire = require('rewire');
const twly = rewire('../index');
const Message = require('../message');

const messageIndexByHash = twly.__get__('messageIndexByHash');
const messageIndexByFiles = twly.__get__('messageIndexByFiles');
const hasMoreNewlinesThan = twly.__get__('hasMoreNewlinesThan');
const numLines = twly.__get__('numLines');
const meetsSizeCriteria = twly.__get__('meetsSizeCriteria');
const hashString = twly.__get__('hashString');
const makeBlockArray = twly.__get__('makeBlockArray');
const minifyBlocks = twly.__get__('minifyBlocks');
const removeEmpty = twly.__get__('removeEmpty');
const minify = twly.__get__('minify');
const isTextFile = twly.__get__('isTextFile');

test('messageIndexByHash', () => {
  let file = 'foo.js'
  let hash = '3858f62230ac3c915f300c664312c63';
  let msgs = [new Message([file], 'some type', hash)];
  expect(messageIndexByHash(hash, msgs)).toEqual(0);
});

test('messageIndexByFiles', () => {
  let file = 'foo.js';
  let hash = '3858f62230ac3c915f300c664312c63'
  let msgs = [new Message([file], 'some type', hash)];
  expect(messageIndexByFiles(['foo.js'], msgs)).toEqual(0);
});

test('hasMoreLinesThan', () => {
  let input = 'foo \n foo \n foo';
  expect(hasMoreNewlinesThan(input, 2, true)).toBeTruthy();
  expect(hasMoreNewlinesThan(input, 2, false)).toBeTruthy();
  expect(hasMoreNewlinesThan('foo', 1, true)).toBeFalsy();
});

test('numLines', () => {
  expect(numLines('foo')).toEqual(0);
  expect(numLines('foo \n foo \n foo \n foo')).toEqual(4);
});

test('meetsSizeCriteria', () => {
  expect(meetsSizeCriteria('foo', 2, 8)).toBeFalsy();
  expect(meetsSizeCriteria('this is my \n\n special \n\n line \n\n of text', 3, 4)).toBeTruthy();
});

test('hashString', () => {
  expect(hashString('foobar')).toEqual('3858f62230ac3c915f300c664312c63f');
});

test('makeBlockArray', () => {
  let input = 'I have so much text \n\n\n\n the best text \n\n and no punctuation its great';
  let output = ['I have so much text ', ' the best text ', ' and no punctuation its great'];
  expect(makeBlockArray(input)).toEqual(output);
});

test('minifyBlocks', () => {
  let input = ['', 'this is \n some \t text', '', '', 'and it is good'];
  let output = ['thisissometext', 'anditisgood'];
  expect(minifyBlocks(input)).toEqual(output);
});

test('removeEmpty', () => {
  expect(removeEmpty(['', 'foo', '', '', '', 'bar', 1, true, false, 'baz']))
    .toEqual(['foo', 'bar', 1, true, false, 'baz']);
});

test('minify', () => {
  let text = '\n foobar \n\t foobar again some more \n\n \t text here';
  expect(minify(text)).toBe('foobarfoobaragainsomemoretexthere');
});

test('isTextFile', () => {
  expect(isTextFile('foo.png')).toBeFalsy();
  expect(isTextFile('bar.txt')).toBeTruthy();
});