const twly = require('../index');
const stripAnsi = require('strip-ansi');
const constants = require('../constants');

function normalize (txt) {
  return stripAnsi(txt).trim();
}

test('Detects duplicate files', () => {
  return twly({ files: 'mocks/images/**.*', logLevel: 'TEST' })
    .then((report) => {
      let messages = report.messages;
      expect(messages.length).toBe(1);
      let message = normalize(messages[0]);
      expect(message).toContain('towelie.jpeg');
      expect(message).toContain('towelie-1.jpeg');
      expect(message).toContain('are IDENTICAL WTF !!!')
    });
});

test('Detects duplicates in a file', () => {
  return twly({ files: 'mocks/css/dribble.css', logLevel: 'TEST' })
    .then((report) => {
      let messages = report.messages;
      expect(messages.length).toBe(1);
      expect(normalize(messages[0])).toContain('dribble.css, repeats the following within the file:')
    });
});

test('Detects duplicates between files even when that matched content is duplicated WITHIN one of those files', () => {
  return twly({ files: 'mocks/css/*ibble.css', logLevel: 'TEST' })
    .then((report) => {
      let messages = report.messages;
      console.log(messages);
      expect(messages.length).toBe(2);
      let message1 = normalize(messages[0]);
      expect(message1).toContain('dribble.css, repeats the following within the file:');
      let message2 = normalize(messages[1]);
      expect(message2).toContain('dribble.css');
      expect(message2).toContain('fibble.css');
      expect(message2).toContain('repeat the following: ');
    });
})

