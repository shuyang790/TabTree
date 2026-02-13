import { groupTabIds as groupTabIdsModel } from "./rootBucketsModel.js";

export function orderedExistingGroups(tree, blocks, options = {}) {
  const {
    unnamedGroupLabel = "Unnamed group",
    groupTabIds = groupTabIdsModel
  } = options;

  const ordered = [];
  const seen = new Set();

  for (const block of blocks || []) {
    if (block?.type !== "group") {
      continue;
    }
    const group = tree.groups?.[block.groupId];
    if (!group || seen.has(group.id)) {
      continue;
    }
    const tabCount = groupTabIds(tree, group.id).length;
    ordered.push({
      id: group.id,
      title: group.title || unnamedGroupLabel,
      color: group.color,
      tabCount
    });
    seen.add(group.id);
  }

  for (const group of Object.values(tree.groups || {})) {
    if (!Number.isInteger(group?.id) || seen.has(group.id)) {
      continue;
    }
    const tabCount = groupTabIds(tree, group.id).length;
    ordered.push({
      id: group.id,
      title: group.title || unnamedGroupLabel,
      color: group.color,
      tabCount
    });
    seen.add(group.id);
  }

  return ordered;
}

