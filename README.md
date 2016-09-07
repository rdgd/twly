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

You can use twly by simply running the command `twly`. This will analyze all the files and recurse into subdirectories in your current working directory by default. You can also pass twly a glob pattern... If for example you wanted all javascript files in your current directory and all subdirectories: `twly '**/*.js'`. This will analyze all CSS files in your current working directory `twly '*.css'`.

See the [node-glob](https://github.com/isaacs/node-glob) project for options on how to specify files.

