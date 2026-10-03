import { test } from "node:test";
import assert from "node:assert/strict";
import { connectorPoints, nearStroke } from "../src/canvasGeometry";
import { cardSchema, createCard, connectorSchema } from "../src/model";
test("connector endpoints follow the visible edges when elements move or resize", () => {
  const a = { x: 100, y: 200, width: 200, height: 100 },
    b = { x: 600, y: 200, width: 100, height: 100 };
  assert.deepEqual(connectorPoints(a, b), [
    [300, 250],
    [600, 250],
  ]);
  assert.deepEqual(connectorPoints({ ...a, width: 300 }, { ...b, x: 700 }), [
    [400, 250],
    [700, 250],
  ]);
  const points = connectorPoints(a, { ...b, y: 500 });
  assert.notDeepEqual(points, [
    [300, 250],
    [600, 250],
  ]);
  assert.ok(points[1][1] >= 500);
});
test("eraser hits a stroke segment between recorded points, including zero-length segments", () => {
  assert.equal(
    nearStroke(
      [50, 4],
      [
        [0, 0],
        [100, 0],
      ],
      8,
    ),
    true,
  );
  assert.equal(
    nearStroke(
      [50, 20],
      [
        [0, 0],
        [100, 0],
      ],
      8,
    ),
    false,
  );
  assert.equal(
    nearStroke(
      [10, 10],
      [
        [10, 10],
        [10, 10],
      ],
      8,
    ),
    true,
  );
});
test("old lessons get resize defaults and malformed element sizing/connectors are rejected", () => {
  const card = createCard();
  for (const key of ["width", "height", "textScale", "tint"])
    delete (card as unknown as Record<string, unknown>)[key];
  const parsed = cardSchema.parse(card);
  assert.equal(parsed.width, 0);
  assert.equal(parsed.textScale, 1);
  assert.equal(
    cardSchema.safeParse({ ...parsed, width: Infinity }).success,
    false,
  );
  assert.equal(
    connectorSchema.safeParse({
      id: "a",
      from: "same",
      to: "same",
      color: "#3159e8",
      width: 2,
    }).success,
    false,
  );
});
