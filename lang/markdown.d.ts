// The changelogs are imported as text (esbuild's ".md" text loader) so that the
// plugin can render the notes for the release it is running. tsc needs to be
// told the shape of such an import.
declare module "*.md" {
	const content: string;
	export default content;
}
