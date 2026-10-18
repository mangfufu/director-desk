# DirectorDesk

[简体中文](README.md) · **English**

**Block the scene. Plan the camera moves. Export a reference video.**

DirectorDesk is a 3D previsualization tool for AI video creators. Use simple models to plan where characters stand, how they move, and how the camera captures the action. Export the result as a reference video, with scene-specific prompts for your video generation model.

Work directly in the editor, or connect an AI agent that can build and edit the scene for you.

[Download for Windows / Linux](https://github.com/mangfufu/director-desk/releases/latest) · [Release notes](https://github.com/mangfufu/director-desk/releases) · [Report an issue](https://github.com/mangfufu/director-desk/issues) · [Agent skill](skills/director-desk/)

![DirectorDesk: stage view on the left, camera view on the right, and the timeline below](docs/images/workspace-0.4.10.jpg)

Latest release: **[0.5.1](https://github.com/mangfufu/director-desk/releases/tag/v0.5.1)** — Linux packages, in-app updates for AppImage, and fixes for timeline scrubbing in WSL and AI tool calls. Screenshots below are from 0.4.10 and show the Chinese interface.

## From an idea to a reference video

1. **Build a set.** Start with a template or a blank scene. Add characters, furniture, buildings, and props.
2. **Block the action.** Place characters, assign actions, draw movement paths, and position your cameras. Arrange camera moves and cuts on the timeline.
3. **Preview and export.** Check the actual camera views, export a reference video, and prepare the prompts for each scene.

Every camera renders the same 3D scene you edit. Switch between Stage, Split, and Camera views to see how a change affects the shot.

DirectorDesk plans the visual reference; your chosen video generation model produces the final footage.

Browse built-in and saved actions in the **Actions** tab, then drag one onto a character’s timeline track. Move clips before, after, or between other clips; a preview shows where they will land, and later clips shift when needed to make room. Right-click a clip to adjust its timing, split at the playhead, or delete it. Right-click an object in the stage view to frame, duplicate, or hide it.

## Let AI work in the editor

**Built-in assistant.** Configure a model provider and describe what you want. The assistant can build sets, arrange character movement, and edit camera work. Review what changed, jump to the affected objects and times, or undo an edit. You can also select characters, clips, or a time range and ask AI to work on that selection.

**External agents through MCP.** Connect an MCP-capable agent, such as Codex or Claude Code, to the project currently open in DirectorDesk. Open **AI → MCP Connection**, copy the configuration for your client, and have the agent read the built-in skill. Claude Desktop can use the included local stdio bridge. Local MCP is enabled by default; turning it off is remembered.

![The built-in assistant with an example scene and camera request](docs/images/ai-assistant-0.4.10.jpg)

*This screenshot shows a draft request before it is sent.*

Each scene can store two independent prompts: one for generation with a reference video, and one for text-only generation. The bundled skill is included with the app. You can also import your own skills and enable or disable them as needed.

## Draw character movement

Select a character, open **Blocking**, and choose **Freehand**. Drag to draw a path, then release and draw again to extend it. Paths can follow the ground or visible surfaces, including stairs and platforms. You can edit the waypoints and timing afterward. Freehand drawing also works for camera paths.

![Drawing a character path in a street scene](docs/images/freehand-path-0.4.10.jpg)

You can also control a character with the keyboard and record its movement. Continue editing the recorded position and action clips on the timeline. Recording from a later point preserves the earlier blocking.

## Color and depth video

Export the same scene and camera work as a color reference video or a grayscale depth video. Adjust the near and far distances, invert the depth, and tune the depth curve. You can fit the range to the current view or selected objects.

| Color | Depth |
| --- | --- |
| ![Color render of a corridor scene](docs/images/depth-color-0.4.10.png) | ![Depth render from the same camera at the same time](docs/images/depth-depth-0.4.10.png) |

*Both images use the same scene, camera, and time. Depth exports retain the blocking, camera movement, and cuts.*

## More creative tools

| Task | Tools |
| --- | --- |
| Build sets quickly | Built-in models, geometric primitives, object colors, adjustable dimensions, and surface snapping |
| Bring your own assets | GLB/glTF, FBX, and OBJ model import; animation import and a personal action library |
| Design camera work | Multiple cameras, POV attachments, zoom, dolly zoom, handheld motion, lens distortion, depth of field, and focus controls |
| Shape the image | Lighting and shadows, image and video surfaces, mirrors, particles, deformation, and keyframes |
| Plan multiple scenes | Independent scenes, continuation from the previous scene’s final frame, clip multi-selection, splitting, and easing curves |
| Prepare a handoff | Single-scene and batch video export, project files, asset packages, and optional character name labels |

- **Reusable sets:** group objects, align them, create arrays, or save a setup to your set library.
- **Character poses and physics:** adjust joints and use optional gravity, collision, inertia, and ragdoll controls for falls, rolling objects, and impulse-driven movement.
- **Project versions:** save named versions and restore them after restarting the app.
- **Automatic routing:** generate routes around static obstacles on a level ground surface, with staggered starts for crowds.
- **Plugins:** install, enable, and disable extensions that add creative tools and visual effects. See the [plugin guide and example](docs/plugins.md) (Chinese).

## Templates you can edit

These previews were rendered by DirectorDesk. They play at the original speed with reduced resolution and frame rate.

| Night Street Chase · Running and handheld camera | Suspense Corridor · Dolly zoom |
| --- | --- |
| ![Night street chase](docs/images/neon-chase.gif) | ![Corridor dolly zoom](docs/images/dolly-hall.gif) |

<details>
<summary>More templates</summary>

| Lighting Stage | Bedroom · Four Characters |
| --- | --- |
| ![Lighting stage](docs/images/light-stage.gif) | ![Bedroom blocking](docs/images/bedroom.gif) |
| Empty Room | Woodland Clearing |
| ![Empty room, first eight seconds](docs/images/room.gif) | ![Woodland clearing](docs/images/park.gif) |
| Street at Dusk | Courtyard |
| ![Street at dusk](docs/images/street.gif) | ![Courtyard](docs/images/courtyard.gif) |

An abstract scene with particles, thin-film surfaces, mirrors, and deformation:

![Abstract light study](docs/images/abstract-stage.png)

</details>

## Download and get started

Get the **Windows installer** or **portable ZIP** from [Releases](https://github.com/mangfufu/director-desk/releases/latest). For the portable edition, extract the entire ZIP before running `DirectorDesk.exe`. Both editions include the agent skill.

**Linux x64:** download the AppImage, make it executable, and run it. Alternatively, extract the tar.gz archive and run `DirectorDesk`. Both include the agent skill. Tested on Ubuntu 24.04 under WSL 2.

Set your default project and export folders in Settings. Updates can be checked against the website and GitHub. The Windows installer edition and Linux AppImage support downloading an update and restarting to apply it. ZIP and tar.gz users replace the app manually. Keep the AppImage in a folder you can write to.

Choose **English** or **简体中文** under **Edit → Settings → Language**. Your choice is remembered. Project names, dialogue, prompts, and AI conversations stay as you wrote them.

For feedback and feature requests, open an [issue](https://github.com/mangfufu/director-desk/issues). To run the web editor locally or contribute code, see [development and build instructions](docs/development.md) (Chinese).

## Star history

<a href="https://www.star-history.com/?repos=mangfufu%2Fdirector-desk&amp;type=date&amp;legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=mangfufu%2Fdirector-desk&amp;type=Date&amp;theme=dark">
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=mangfufu%2Fdirector-desk&amp;type=Date&amp;theme=light">
    <img alt="DirectorDesk GitHub star history" src="https://api.star-history.com/chart?repos=mangfufu%2Fdirector-desk&amp;type=Date&amp;theme=light" width="800">
  </picture>
</a>

## License and community

Original project code is licensed under [MIT](LICENSE). Third-party dependencies and animation assets retain their own licenses; see [NOTICE](src/animation/library/NOTICE.txt) for animation sources.

[Linux.do](https://linux.do/)
