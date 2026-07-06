// Color schemes for condition statuses. Default is green-to-red, with a
// blue-to-red option for colorblind accessibility.

export const SCHEMES = {
  "green-red": {
    label: "Green to red (default)",
    good: "#2e9e44",
    marginal: "#e2b93b",
    bad: "#d84b3a",
  },
  "blue-red": {
    label: "Blue to red (colorblind friendly)",
    good: "#3573d9",
    marginal: "#e2b93b",
    bad: "#d84b3a",
  },
};

export function statusColor(status, schemeId) {
  const scheme = SCHEMES[schemeId] ?? SCHEMES["green-red"];
  return scheme[status] ?? scheme.marginal;
}
