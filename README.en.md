# DirectorDesk

[简体中文](README.md) · **English**

A 3D previsualization tool for AI video production. Build sets, block character movement, design camera work, and export reference videos with matching prompts. Work in the editor or let an AI agent edit the project directly.

[Download for Windows / Linux](https://github.com/mangfufu/director-desk/releases/latest) · [Release notes](https://github.com/mangfufu/director-desk/releases) · [Report an issue](https://github.com/mangfufu/director-desk/issues)

![Stage view, camera view, and timeline](docs/images/workspace-current-en.png)

Latest release: [0.5.5](https://github.com/mangfufu/director-desk/releases/tag/v0.5.5). Interface screenshots show the current release.

## Features

| Feature | What you can do |
| --- | --- |
| Sets and assets | Use built-in characters, props, and templates; build with primitives or import GLB/glTF, FBX, and OBJ models |
| Blender scenes | Import sets, cameras, lights, and animation from a `.blend` file using your local Blender installation. No add-on required |
| Animation and blocking | Browse or import animations, draw movement paths, record keyboard-controlled movement, and adjust poses and physics |
| Cameras | Cut between cameras; use zoom, dolly zoom, handheld motion, lens distortion, and depth of field |
| Timeline | Drag, snap, select, split, and retime clips; control when objects appear and disappear |
| Visual effects | Add lighting, shadows, image and video surfaces, mirrors, particles, deformation, and keyframes |
| Projects and export | Work across scenes, continue from a previous scene’s final frame, save named versions, and batch-export color or depth video |
| Review | Use shot contact sheets, cached previews, and composition guides |

Start with a template or a blank scene, arrange the action and cameras, refine the timing, then preview and export.

## AI-assisted editing

- **Built-in assistant:** configure a model provider, then describe the set, action, or camera changes you want. Target selected characters, clips, or a time range. Locate changes and undo them.
- **External agents:** connect Codex, Claude Code, or another MCP client to edit the current project. Copy the configuration from **AI → MCP Connection**. An included stdio bridge supports Claude Desktop.
- **Video prompts:** save separate reference-video and text-only prompts for each scene. The [bundled skill](skills/director-desk/) updates independently of the app; you can also import your own skills.

<details>
<summary>View the built-in assistant</summary>

![An example request in the assistant, before sending](docs/images/assistant-current-en.png)

</details>

<details>
<summary>View depth video and template demos</summary>

![Depth preview and range controls](docs/images/depth-current-en.png)

| Night Street Chase | Suspense Corridor |
| --- | --- |
| ![Night Street Chase](docs/images/neon-chase.gif) | ![Suspense Corridor](docs/images/dolly-hall.gif) |

These demos were rendered by DirectorDesk. They play at the original speed with reduced resolution and frame rate.

</details>

## Get started

- **Windows:** run the installer, or extract the entire portable ZIP and run DirectorDesk.exe.
- **Linux x64:** make the AppImage executable and run it, or extract the tar.gz archive. Tested on Ubuntu 24.04 under WSL 2.
- **Language:** choose Chinese or English under **Edit → Settings → Language**. The app follows the system locale on first launch, using English outside Chinese locales. A saved preference takes priority.
- **Updates:** the Windows installer edition and Linux AppImage can download an update and restart to apply it. Portable editions are updated manually.

[Development and builds](docs/development.md) · [Plugin API](docs/plugins.md) · [Set editing guide](docs/staging-workflow.md) — these guides are in Chinese.

## Extract motion from video

Open **Video Reconstruction**, choose a video and a time range, review the preview, then open the result as an editable project. Replace character models, trim or retime animation clips, swap actions, and edit movement paths.

The default **Lightweight Recognition** uses [MediaPipe Pose Landmarker Lite](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker). It is bundled with DirectorDesk: no separate installation or dedicated GPU is needed. Processing runs locally. It extracts character motion and approximate positions, without reconstructing the original set or camera movement. Manage installation, storage, and cleanup in Video Reconstruction settings.

![Motion preview from Lightweight Recognition](docs/images/lightweight-current-en.png)

## License and credits

DirectorDesk's original code is licensed under [MIT](LICENSE). Third-party components, models, and assets retain their own licenses:

- [MediaPipe · Apache 2.0](desktop/video-reconstruction/MediaPipe-LICENSE.txt)
- [Human3R](https://github.com/fanegg/Human3R) · [Non-commercial license](desktop/video-reconstruction/Human3R-LICENSE.txt)
- [FlowHMR](https://github.com/flowhmr/flowhmr) / [Windows port](https://github.com/xiaoerofficial021-collab/FlowHMR-Windows) · [Model license](desktop/video-reconstruction/FlowHMR-LICENSE.txt); SMPL+H body files have separate official license terms
- [Animation sources and licenses](src/animation/library/NOTICE.txt)

<details>
<summary>Star History</summary>

[![GitHub Star History](https://api.star-history.com/chart?repos=mangfufu/director-desk&type=Date)](https://www.star-history.com/#mangfufu/director-desk&Date)

</details>

Community: [Linux.do](https://linux.do/)
