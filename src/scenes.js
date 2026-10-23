// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): write a memo in Memos — a house
// journal ("garage door left open at {{...}}"), a reminder, a voice note —
// and pin or unpin the newest memo of a tag (the shopping list of the week).
// -----------------------------------------------------------------------------

const outputs = (memo) => ({
  memo_id: memo.uid,
  title: memo.title.slice(0, 200),
  link: memo.link,
});

export const SCENE_ACTIONS = {
  async create_memo(hub, { fields = {} }) {
    return outputs(
      await hub.createMemo({
        content: fields.content,
        tags: fields.tags,
        visibility: fields.visibility,
        pinned: fields.pinned,
      }),
    );
  },
  async pin_latest(hub, { fields = {} }) {
    return outputs(await hub.pinLatest({ tag: fields.tag, unpin: fields.unpin }));
  },
};
