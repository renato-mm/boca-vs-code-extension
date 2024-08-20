# :balloon: boca-vs-code-extension

A Visual Studio Code extension for BOCA's teams.

[![Google_Groups][groups_badge]][groups_link]

[close_stale_workflow_badge]: https://img.shields.io/github/actions/workflow/status/renato-mm/boca-vs-code-extension/close-stale.yml?label=close%20stale&logo=github
[close_stale_workflow_link]: https://github.com/renato-mm/boca-vs-code-extension/actions?workflow=close%20stale "close stale issues and prs"
[groups_badge]: https://img.shields.io/badge/join-boca--users%20group-blue.svg?logo=data:image/png;base64,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
[groups_link]: https://groups.google.com/g/boca-users "boca-users@Google Groups"

## Table of Contents

- [What Is BOCA?](#what-is-boca)
- [Features](#features)
- [How To Install The Extension](#how-to-install-the-extension)
  - [Option 1](#option-1)
  - [Option 2](#option-2)
- [Configuration](#configuration)
- [How To Contribute](#how-to-contribute)
  - [Instructions](#instructions)
  - [Debugging](#debugging)
    - [Requirements](#requirements)
- [License](#license)
- [Support](#support)

## What Is BOCA?

The BOCA Online Contest Administrator, commonly referred to as BOCA, is a robust administrative system designed for orchestrating programming contests following the [ACM-ICPC](https://icpc.global/) rules, particularly the [Maratona SBC de Programação](https://maratona.sbc.org.br/).
BOCA represents a powerful tool for streamlining the administration of programming contests, making it a valuable asset for contest organizers and participants.
For more in-depth information, please visit the official repository at [https://github.com/cassiopc/boca](https://github.com/cassiopc/boca).

The system's main users are the admins and the teams. An admin is responsible to create a contest and its problems. A team can join a contest, view/download its problems, submit a file for run and view the runs alongside with its files.

## Features

The BOCA VS Code extension aims to simplify the use of BOCA system by teams. With it they can:

- View the contests they are participating;
- View the problems and download its file(s);
- Submit a file for run;
- View the runs and also open the files submitted for it.

As a result, the extension reduces the need of a team to be switching between applications in order to use BOCA system.

This work started as part of the undergraduate final year project carried out by Renato Menezes Machado under supervision of Prof. Dr. Rodrigo Laiola Guimarães at Universidade Federal do Espirito Santo ([UFES](https://www.ufes.br/)).

## How To Install The Extension

As it was explained before, the extension is developed for [Visual Studio Code](https://code.visualstudio.com), so in order to use it, you must install it in VS Code.

> **_Note:_** It is necessary to reload the VS Code window after installation for the extension's colors to work properly.

### Option 1

You can install it by searching for "BOCA" at the marketplace, either at the editor's extensions view or at the [website](https://marketplace.visualstudio.com/items?itemName=ardoboehme.boca). Once you find it you just hit the "Install" button.

<details>
<summary>
Through the extensions view.
</summary>
<br>

![image](https://github.com/user-attachments/assets/4aa2d61a-6962-419b-974d-58ed21b55c6a)
</details>

<br>

<details>
<summary>
Through the website.
</summary>
<br>

![image](https://github.com/user-attachments/assets/74776146-d872-4f1c-835e-7d7ff275038c)
</details>

### Option 2

Another way is to download the VSIX package file located in this repository.

<details>
<summary>
Then in the extensions view, click on the "View and More Actions..." button.
</summary>
<br>

![image](https://github.com/user-attachments/assets/2f101187-688c-4751-966b-416e4687ec4e)
</details>

<br>

<details>
<summary>
Hit the "Install from VSIX..." button.
</summary>
<br>

![image](https://github.com/user-attachments/assets/1758d85b-7bcb-44b6-968f-40a07ad42983)
</details>

<br>

And finally choose the downloaded file.

## Configuration

After the extension is installed you must set these two configuration options in order for it to properly connect to a BOCA system. 

| Name | Default Value | Example | Description |
|---|---|---|---|
| boca.api.uri | "" | https://boca.ufes.br or http://192.168.0.5:3000/api | Uri of the BOCA api. |
| boca.api.salt | "" | GG56KFJtNDBGjJprR6ex | Salt used by the BOCA api. |

## How To Contribute

If you would like to help contribute to this project, please see [CONTRIBUTING](https://github.com/renato-mm/boca-vs-code-extension/blob/main/CONTRIBUTING.md).

### Instructions

1. Fork this repository
2. Clone your forked repo
3. Add your contributions
4. Commit your changes and push them
5. Create a pull request
6. Wait for your pull request to be merged

### Debugging

The easiest way to test the extension is by running it in debug mode.

#### Requirements

- [Visual Studio Code](https://code.visualstudio.com)
- [Node.js 20](https://nodejs.org/en/download/package-manager)

Open your repository with VS Code, open `src/extension.ts`, and simply run the debugging tool. Either by pressing `F5` or running the command `Debug: Start Debugging` from the Command Pallette.

<details>
<summary>
Command Pallette option
</summary>
<br>

![image](https://github.com/user-attachments/assets/2b46e097-f470-4555-bc3f-0a2eaeb75095)
</details>

## License

Copyright Universidade Federal do Espirito Santo (Ufes)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

This program is released under license GNU GPL v3+ license.

## Support

Please report any issues with _boca-vs-code-extension_ [here](https://github.com/renato-mm/boca-vs-code-extension/issues).