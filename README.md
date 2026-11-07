# push3-max-lab

Open-source research and tools for Max for Live on Ableton hardware: a virtual Push 3 in Max, custom Push screens with `live.push`, LEDs and battery, how Live and Push talk to each other, compiled externals on Push 3 standalone, and more. So far, everything here works without SSH and without installing anything on the Push.

## What is inside

| Folder | What it is |
|---|---|
| `virtual-push/` | A Push 3 emulated inside a Max patch (screen, 64 pads, buttons, encoders, lights) that Live drives like the real one. Start with `virtual-push/README.md`. |
| `screens/` | Max for Live devices that draw their own graphics on the Push 3 display with `live.push`, tethered and standalone, plus measurements of what fits where and how fast it refreshes. Start with `screens/README.md`. |
| `hardware/` | Reading the battery level, controlling LEDs, User Mode, the Push 3 SysEx commands, and drawing on the screen with Live closed. Start with `hardware/README.md`. |
| `standalone/` | Compiled Max externals running on Push 3 standalone, planning a device for standalone, and the Push's local web service. Start with `standalone/README.md`. |
| `docs/` | How Live and Push talk to each other, and notes for the push-hack docs. Start with `docs/README.md`. |

## Important notice

This project is not approved, endorsed or supported by Ableton or Cycling '74.

It comes from studying how Live, Max for Live and Push 3 work together, for interoperability. Nothing in this repository is Ableton's code, firmware or files: findings are described in our own words, and tools that need parts of Live (such as the virtual Push) build them on your machine from your own copy of Live, without modifying the installed application.

Use it at your own risk. Back up your Sets and User Library before trying anything on a standalone Push. A Live or Push update can break any of this at any time.

## How it was made

Built with Claude (Anthropic), mainly with Opus 5.5 and Fable 5.1 on high, as a coding and research agent, directed, tested on real hardware and reviewed by me.

## Licence

Code is under the MIT licence (`LICENSE`). Documentation, notes and images are under Creative Commons Attribution 4.0 (`LICENSE-docs.md`). Ableton, Push and Live are trademarks of Ableton AG; Max is a trademark of Cycling '74. They are named here only to describe what the tools work with.
