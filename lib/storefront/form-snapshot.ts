/** Compare persisted form values, not clicks, focus, previews or input order. */
export function storefrontFormSnapshot(data: FormData): string {
  return JSON.stringify(Array.from(data.entries()).map(([key, value]) => [key,
    typeof value === "string" ? value : value.size === 0 && !value.name ? null
      : { name: value.name, size: value.size, type: value.type, modified: value.lastModified },
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}
