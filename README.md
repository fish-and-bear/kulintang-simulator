# Kulintang Simulator

A browser-playable 3D Maranao kulintang built with Three.js. The instrument
uses 48 individual gong strikes and four reference performances from one
Katunog recording session in Tugaya, Lanao del Sur.

## Run locally

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Build the production bundle with:

```sh
pnpm build
```

## Play

- Click or tap a gong. The raised boss uses the recorded strike directly;
  positions toward the rim use an experimental acoustic model.
- Keyboard gongs: `A S D F J K L ;`
- Drag to rotate the view and pinch or scroll to zoom.
- Record a phrase, play it back, and toggle looping from the transport.
- Open the music control for the Katunog reference performances.

## Audio

The bundled audio comes from Katunog record `PIISD02606`, performed by
Caironesa C. Dimatanday in Tugaya, Lanao del Sur. The gong samples preserve the
set's relative tuning; the interface therefore numbers the gongs instead of
assigning fixed Western pitches.

Katunog is the Philippine Indigenous Instrument Sounds Database Project of
DOST-ASTI and the University of the Philippines.

- Source: https://katunog.asti.dost.gov.ph/
- Project background: https://asti.dost.gov.ph/communications/angsurian/2019/bridging-the-gap-between-local-music-culture-and-the-new-generation-through-project-katunog/

The Katunog recordings are included under the project operator's stated
permission for this educational, non-commercial simulator. They are not
licensed under MIT. See [NOTICE.md](NOTICE.md).

## Environments

The Lapa, Epping Forest 01, and Park Music Stage panoramas and HDR environments
come from [Poly Haven](https://polyhaven.com/) and are released under CC0.

## License

Original simulator code is available under the MIT License. Bundled recordings
and third-party environment assets retain the terms described in
[NOTICE.md](NOTICE.md).
