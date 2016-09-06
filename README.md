<table>
<tr>
<td>
<img  src="https://github.com/rdgd/twly/raw/master/assets/towel.png" alt="You're a towel" />
</td>
<td>
<b>twly</b> (pronounced "towel-E") is a static analysis tool which can help you keep your code DRY (Don't Repeat Yourself) by letting you know where you have copy and pasted entire files or portions of them. Run twly on a directory, and twly will magically generate a report for you indicating what has been repeated and in which files. twly is language agnostic and can be used on any text document.
</td>
</tr>
</table>

# Installation

`npm install -g twly` or to include in some project `npm install twly --save-dev`

# Usage

You can use `twly` in your command line, by passing it a glob pattern, like this: `twly **/*.js`.

See the [node-glob](https://github.com/isaacs/node-glob) project for options on how to specify files.

