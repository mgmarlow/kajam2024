import kaplay, { GameObj, TileComp } from "kaplay";
import "kaplay/global";

const k = kaplay();

const TILE_SIZE = 64;

k.loadSprite("kat", "sprites/kat.png");
k.loadSprite("ghost", "sprites/ghosty.png");
k.loadSprite("wall", "sprites/steel.png");
k.loadSprite("spike", "sprites/spike.png");
k.loadSprite("exit", "sprites/portal.png");
k.loadSprite("box", "sprites/grass.png");

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

// prettier-ignore
const level1 = [
  ".........",
  ". b  x  .",
  ".b x x p.",
  ".  x x  .",
  "........."
]

scene("game", () => {
  const level = k.addLevel(level1, {
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    tiles: {
      k: ({ x, y }) => [k.sprite("kat"), coord(x, y), "kat"],
      ".": ({ x, y }) => [k.sprite("wall"), coord(x, y), "wall"],
      x: ({ x, y }) => [k.sprite("spike"), coord(x, y), "spike"],
      p: ({ x, y }) => [k.sprite("exit"), coord(x, y), "exit"],
      b: ({ x, y }) => [k.sprite("box"), coord(x, y), "box"],
    },
  });

  const player = level.spawn("k", k.vec2(1, 1));

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
      // Only one obj per tile supported.
      const content = destTile;

      if (content.is("exit")) {
        console.log("win!");
      }

      if (content.is("wall")) {
        return;
      }

      if (content.is("spike")) {
        if (player.is("kat")) {
          player.unuse("sprite");
          player.unuse("kat");
          player.use(sprite("ghost"));
          player.use("ghost");
        }
      }

      if (player.is("ghost") && content.is("box")) {
        return;
      }

      if (content.is("box")) {
        const boxNextX = content.cx + dirx;
        const boxNextY = content.cy + diry;

        const boxDest = getC(boxNextX, boxNextY);
        if (boxDest) {
          if (boxDest.is("wall") || boxDest.is("box")) {
            return;
          }

          if (boxDest.is("spike")) {
            boxDest.destroy();
            content.destroy();
          }
        }

        content.cmove(dirx, diry);
      }
    }

    player.cmove(dirx, diry);

    updateCMap();
  };

  k.onKeyPress("d", () => {
    move(1, 0);
  });

  k.onKeyPress("a", () => {
    move(-1, 0);
  });

  k.onKeyPress("w", () => {
    move(0, -1);
  });

  k.onKeyPress("s", () => {
    move(0, 1);
  });
});

k.go("game");
