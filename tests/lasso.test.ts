import { test } from "node:test";
import assert from "node:assert/strict";
import { lassoHitsBox, lassoHitsStroke, insideLasso } from "../src/lasso";
import { addCard, createCard, patchCard, readCards } from "../src/model";
import * as Y from "yjs";
test("freehand lasso uses its actual polygon, including crossing ink, instead of its bounding rectangle", () => {
  const polygon: [number, number][] = [
    [0, 0],
    [100, 0],
    [0, 100],
  ];
  assert.equal(insideLasso([10, 10], polygon), true);
  assert.equal(
    lassoHitsBox(polygon, { x: 80, y: 80, width: 10, height: 10 }),
    false,
  );
  assert.equal(
    lassoHitsBox(polygon, { x: 5, y: 5, width: 10, height: 10 }),
    true,
  );
  assert.equal(
    lassoHitsStroke(polygon, [
      [-10, 30],
      [90, 30],
    ]),
    true,
  );
  assert.equal(
    lassoHitsStroke(polygon, [
      [80, 80],
      [90, 90],
    ]),
    false,
  );
});
test("changing a phrase mode releases its manually enlarged height without losing width or text size", () => {
  const doc = new Y.Doc(),
    card = createCard({ height: 400, width: 300, textScale: 1.3 });
  addCard(doc, card);
  patchCard(doc, card.id, { mode: "practice" });
  assert.equal(readCards(doc)[0].height, 0);
  assert.equal(readCards(doc)[0].width, 300);
  assert.equal(readCards(doc)[0].textScale, 1.3);
  doc.destroy();
});
