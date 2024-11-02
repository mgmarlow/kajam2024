import kaplay, { GameObj, TileComp } from "kaplay";
import "kaplay/global";

kaplay({
  background: [74, 48, 82],
});

const TILE_SIZE = 64;

loadSprite("kat", "sprites/kat.png");
loadSprite("ghost", "sprites/ghosty.png");
loadSprite("wall", "sprites/steel.png");
loadSprite("spike", "sprites/spike.png");
loadSprite("exit", "sprites/portal.png");
loadSprite("box", "sprites/grass.png");

const coord = (cx: number, cy: number) => {
  return {
    id: "coord",
    requires: ["pos"],
    cx,
    cy,
    update() {
      this.pos.x = this.cx * TILE_SIZE;
      this.pos.y = this.cy * TILE_SIZE;
    },
    cmove(nextx: number, nexty: number) {
      this.cx += nextx;
      this.cy += nexty;
    },
  };
};

let currentLevel = 0;

interface Level {
  title: string;
  data: string[];
}

// prettier-ignore
const levels = {
  0: {
    title: "rebirth",
    data: [
      ".........",
      ".  x    .",
      ".  x   p.",
      ".  x    .",
      "........."
    ],
  },
  1: {
    title: "spike trap",
    data: [
      ".........",
      ".  x b  .",
      ".  x b p.",
      ". bx b  .",
      "........."
    ]
  },
};

scene("selected", (level: Level) => {
  add([text(level.title), pos(center().add(0, -50)), anchor("center")]);
  add([text("press z"), pos(center().add(0, 50)), anchor("center")]);
  onKeyPress("z", () => {
    go("game", level.data);
  });
});

scene("menu", () => {
  let selectedLevel = 0;

  add([text("kajam2024"), pos(center().add(0, -50)), anchor("center")]);
  add([text("press z to start"), pos(center().add(0, 50)), anchor("center")]);
  add([text("wasd: move, z: undo, r: restart"), pos(center().add(0, 150)), anchor("center")]);

  onKeyPress("z", () => {
    go("selected", levels[selectedLevel]);
  });
});

scene("game", (levelData: string[]) => {
  const level = addLevel(levelData, {
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    pos: vec2(100, 100),
    tiles: {
      k: ({ x, y }) => [sprite("kat"), coord(x, y), "kat"],
      ".": ({ x, y }) => [sprite("wall"), coord(x, y), "wall"],
      x: ({ x, y }) => [sprite("spike"), coord(x, y), "spike"],
      p: ({ x, y }) => [sprite("exit"), coord(x, y), "exit"],
      b: ({ x, y }) => [sprite("box"), coord(x, y), "box"],
    },
  });

  const player = level.spawn("k", vec2(1, 1));

  const serialize = (x: number, y: number) => x + y * level.numColumns();

  const createCMap = () => {
    return level.get("coord").reduce((acc, cur) => {
      acc[serialize(cur.cx, cur.cy)] = cur;
      return acc;
    }, []);
  };

  const getC = (x: number, y: number): GameObj | undefined =>
    cmap[serialize(x, y)];

  let cmap = createCMap();
  const updateCMap = () => {
    cmap = createCMap();
  };

  const move = (dirx: number, diry: number) => {
    const destX = player.cx + dirx;
    const destY = player.cy + diry;
    const destTile = getC(destX, destY);

    if (destTile) {
      if (destTile.is("exit")) {
        currentLevel++;
        if (levels[currentLevel]) {
          go("selected", levels[currentLevel]);
        } else {
          go("win");
        }
        return;
      }

      if (destTile.is("wall")) {
        return;
      }

      if (destTile.is("spike")) {
        if (player.is("kat")) {
          player.unuse("sprite");
          player.unuse("kat");
          player.use(sprite("ghost"));
          player.use("ghost");
        }
      }

      if (player.is("ghost") && destTile.is("box")) {
        return;
      }

      if (destTile.is("box")) {
        const boxNextX = destTile.cx + dirx;
        const boxNextY = destTile.cy + diry;

        const boxDest = getC(boxNextX, boxNextY);
        if (boxDest) {
          if (boxDest.is("wall") || boxDest.is("box")) {
            return;
          }

          if (boxDest.is("spike")) {
            boxDest.destroy();
            destTile.destroy();
          }
        }

        destTile.cmove(dirx, diry);
      }
    }

    player.cmove(dirx, diry);

    updateCMap();
  };

  onKeyPress("d", () => {
    move(1, 0);
  });

  onKeyPress("a", () => {
    move(-1, 0);
  });

  onKeyPress("w", () => {
    move(0, -1);
  });

  onKeyPress("s", () => {
    move(0, 1);
  });

  onKeyPress("z", () => {
    // TODO
  });

  onKeyPress("r", () => {
    go("game", levels[currentLevel].data);
  });
});

scene("win", () => {
  add([text("You Win!"), pos(center()), anchor("center")]);
});

go("menu");
