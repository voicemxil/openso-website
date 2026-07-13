FreeSO is the reason The Sims Online still exists in any playable form. Years of reverse-engineering went into it, and OpenSO is built directly on top of that work. But the project has been quiet for a while, and a lot of the machinery around the game had aged badly: how it builds, how it updates, how you install it, how you host it, how it draws.

Here's what we've changed so far, and why.

## The foundation

We didn't start from FreeSO's last official build. We started from [segerend/freeso](https://github.com/segerend/freeso), a fork that had already finished the hard work of getting the codebase onto .NET 9. That's the base OpenSO is built on. Without it we'd have spent weeks or months on plumbing before we could change anything at all.

From there, OpenSO builds on .NET 10 from a single solution, and every push to the repository produces a full client for Windows, macOS, and Linux, plus the server. The macOS client is now a properly signed `OpenSO.app` bundle rather than a folder of loose files.

The graphics framework moved as well. FreeSO ran on a custom fork of MonoGame, patched years ago for reasons that made sense at the time. OpenSO runs on current upstream MonoGame (3.8.5) from NuGet. Sitting on a private fork of your graphics framework means you stop getting fixes and you own every new platform problem yourself. Being back on the mainline is what made most of the rendering work below possible. It also paves the way for DX12/Vulkan support in the future after the next MonoGame release.

Updates changed shape too. FreeSO had automated incremental patching already, but it generated the deltas on the game server box, so the machine running the shard was also the machine building your updates. In OpenSO, CI generates the deltas as part of the release, and the server just reconciles the update chain from GitHub Releases. Anyone standing up their own shard gets working incremental updates without running a build pipeline on it. The patcher now also waits for the game to close before it starts patching, which it did not previously do.

The networking layer was rewritten. FreeSO's client and server talked to each other through Mina.NET, a port of an old Java networking library that had long since stopped being maintained. It's gone from the desktop and server builds now, replaced with a transport we wrote ourselves on plain async sockets. The wire format is unchanged, so nothing about the protocol had to be relearned, but we now own the code that pushes bytes down it, allowing game traffic to optionally be encrypted end to end with TLS.

Hosting used to mean assembling a server yourself from documentation written for a different decade. There's now a Docker stack (game server, database, automatic HTTPS) and a deployment guide that starts at "you have nothing" and ends at "you're live." The server pulls its own updates, restarts nightly with a warning like the old servers did, and can be deployed from an admin dashboard.

In-client registration is now supported. You sign up without leaving the game, get a six-digit code by email, type it in, and you're playing. The client points at OpenSO by default and won't fall back to EA's servers, which have been gone for twenty years.

## The launcher

The FreeSO Launcher was an Electron app, which meant it shipped a copy of Chrome in order to draw a few buttons. The new OpenSO Launcher is built on native C# with Avalonia.

It's a port, not a rewrite. The launcher's value was never in the UI, it was in the platform install logic underneath: dependency resolution, registry detection on Windows and path detection elsewhere, downloads that retry and resume when your connection drops, extraction of both zips and the InstallShield cabinets the original TSO assets come in.

What changed is everything around it. Without Chromium the launcher is tens of megabytes instead of well over a hundred, and it isn't sitting in your tray eating RAM. It builds self-contained for Windows, macOS (Intel and Apple Silicon), and Linux, with a Windows installer and a macOS app bundle.

It also does more than launch. The homepage shows live server status: players online, lots online, the in-game clock, and the busiest lots, with plans for more features to be added in the future. It updates itself, and when it updates the game it uses the same incremental delta chain the in-client patcher does, so it doesn't matter which route you take.

## Create-A-Sim

Making your sim is the first thing you do in TSO, and it looked its age, with a fixed 1024x768 window and your Sim viewed only through a tiny oval. The new Create-A-Sim adapts to the window size, and puts your sim in a perspective view you can rotate, zoom, and inspect. The menu now features a translucent panel with proper Head, Body, and Bio tabs and paged thumbnail grids with larger icons, instead of the old sprite-drawn dialog.

Underneath, it's the same avatar data and the same save path, so nothing about how characters are created has changed. It's currently behind a flag while we finish it.

## Performance and timing

TSO's simulation logic has always run at a fixed 30Hz, with the visuals interpolated on top of it. That hasn't changed. What was fixed in FreeSO was the render rate: 60fps, with animation and camera motion counted in frames rather than elapsed time.

The render rate is decoupled now, and motion is timed against the wall clock rather than the frame counter. High refresh rate monitors get smoother motion, and the interpolation stays correct at whatever framerate you're actually running.

3D mode is enabled by default. It was already in FreeSO, but hidden behind a launch flag, so most people never saw it. It's also much cheaper to run now, because the 3D render resolution scales in both directions. You can render below your output resolution and upscale, down to a third of it, which brings 3D mode within reach of fairly modest hardware. Or you can render above native and supersample if you have the headroom.

One server-side fix worth mentioning: rejoining a lot was being rejected for up to a minute after your sim had already left it. That's fixed.

## The rendering pipeline

The graphics settings have been improved. Render scale is now an adjustable slider, and anti-aliasing lives in one dropdown instead of unlabelled radio buttons. The menu offers a single list of mutually exclusive modes, and it only shows you what your machine can actually do: hardware MSAA levels above what the GPU reports are filtered out of the list, e.g. Apple Silicon users can't get offered an 8× mode.

Everything else rests on a new post processing pipeline. In 3D mode the engine now renders a velocity buffer and a full-precision depth buffer alongside the image, so it knows how far away every pixel is and how fast it's moving. Those passes are optional: turn the effects that need them off, and you don't pay for them. This enables a new optional suite of effects:

- **Cosmic TAA**, our own temporal resolve, and the piece we've put the most work into by a wide margin. Temporal AA gathers pixel samples from multiple frames in order to reconstruct a higher detail image. There's a Lite variant for weaker GPUs.
- **Cosmic TAAU**, temporal upscaling that reconstructs a native resolution output from low resolution samples.
- **FSR1** spatial upscaling.
- **RCAS** sharpening, at an adjustable strength.
- **Per-pixel motion blur**, using real motion vectors instead of approximating from camera movement, with an intensity slider.
- **Bloom**, with adjustable threshold and intensity.

I spent far longer tuning the temporal work than building it. Ghosting, ringing, and loss of detail at low render scales are easy to trade against each other and very hard to fix at the same time, and after enough rounds of adjusting a number and squinting at the result, we gave up and wrote a separate tool that renders reference frames and tunes the resolve pass against them automatically.

All of this is 3D-only at the moment, because that's where the velocity buffer and post-processing stack exists. It doesn't all have to stay that way. Camera motion blur would work in the classic 2D view and is on the list, possibly along with blur driven by the sims' own movement. Bloom could plausibly work in 2D as well. Render scaling currently applies to the world, and could eventually extend to the sim models.

Longer term, depth and velocity buffers are a key input to many modern rendering techniques. Ambient occlusion, depth of field, better shadows, or more interesting lighting all become possible from here. We're not promising any of it, but the groundwork exists.

## Proofs of concept

A fair amount of the work above started as an experiment rather than a plan. We build the smallest thing that proves a system works, see what it teaches us, and keep it or throw it away. Some of it gets thrown away.

The clearest example is the **Social Bunny**. In The Sims 2, a sim whose social need bottoms out while they're alone gets an imaginary friend for company. We built one for TSO: an NPC that appears next to you when your Social is critically low and there's no other player nearby, socialises with you, and leaves once you've recovered.

It's a small feature, and that was the point. TSO's simulation runs in lockstep: the server and every client run the same VM and have to reach identical results, or the lot desyncs. Adding a brand new NPC that spawns, acts, and despawns on its own, without any of that drifting apart across machines, is a real test of whether we can extend the simulation rather than only maintain it. It works. I'll also admit I've grown fond of the thing.

Expect more of this: small, self-contained features that prove out a system we want to build on later.

## Getting to beta

It works, and we're now finding out where it doesn't. Before we call anything a beta:

**Stability with real player counts.** A server holding up for a handful of testers tells you very little about a busy evening. Mostly this means getting people onto lots and watching what breaks.

**The update path holding up in the wild.** Every patch is a live test of the patcher, the delta chain, and now the launcher. It's been fine so far, across a fairly small number of releases.

**Performance on ordinary hardware.** The render scaling work exists for exactly this, but it needs testing on machines that aren't ours.

**Moderation tooling.** A server worth being on is one that's actively maintained, and the tools for that don't exist yet.

We're not putting a date on it. I'd rather ship a beta that's ready than one that's on time. What we can tell you is what it'll be when it arrives: free, open source, and never pay-to-win. No paid items, no perks for donations, no way to buy an advantage.

If you want to help, make an account, grab the launcher, and tell us what's broken.

## Credit

OpenSO is a fork of [FreeSO](https://github.com/riperiperi/FreeSO) by Rhys Simpson (riperiperi) and its contributors, used under the MPL-2.0. We forked specifically from [segerend/freeso](https://github.com/segerend/freeso), whose .NET 9 modernization everything above is built on. The launcher is a port of [fsolauncher](https://github.com/ItsSim/fsolauncher) by ItsSim.

> The Sims™ is a trademark of EA. OpenSO is a fan project and is not affiliated with EA.