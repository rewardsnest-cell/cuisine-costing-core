// Re-export the existing /quote route at /catering/quote so the URL nests under
// the marketing site without duplicating the 500-line builder implementation.
export { Route } from "./quote";
