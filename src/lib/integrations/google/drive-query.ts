export function driveFilesListUrl(input: {
  apiBase: string;
  query: string;
  fields: string;
  orderBy?: string;
}) {
  const params = new URLSearchParams({
    q: input.query,
    fields: input.fields,
    spaces: "drive",
  });
  if (input.orderBy) {
    // Drive lists ascending by default and only accepts `desc` as a direction
    // modifier. Normalize an accidental SQL-style `asc` before sending it.
    const orderBy = input.orderBy.replace(/\s+asc(?=,|$)/gi, "");
    params.set("orderBy", orderBy);
  }
  return `${input.apiBase}/files?${params}`;
}

function driveQueryLiteral(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function driveGroupFolderQuery(groupId: string, parentId?: string) {
  const clauses = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    "appProperties has { key='billMoshiWorkspaceType' and value='group' }",
    `appProperties has { key='billMoshiGroupId' and value='${driveQueryLiteral(groupId)}' }`,
  ];
  if (parentId) clauses.push(`'${driveQueryLiteral(parentId)}' in parents`);
  return clauses.join(" and ");
}
