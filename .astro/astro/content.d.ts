declare module 'astro:content' {
	interface RenderResult {
		Content: import('astro/runtime/server/index.js').AstroComponentFactory;
		headings: import('astro').MarkdownHeading[];
		remarkPluginFrontmatter: Record<string, any>;
	}
	interface Render {
		'.md': Promise<RenderResult>;
	}

	export interface RenderedContent {
		html: string;
		metadata?: {
			imagePaths: Array<string>;
			[key: string]: unknown;
		};
	}
}

declare module 'astro:content' {
	type Flatten<T> = T extends { [K: string]: infer U } ? U : never;

	export type CollectionKey = keyof AnyEntryMap;
	export type CollectionEntry<C extends CollectionKey> = Flatten<AnyEntryMap[C]>;

	export type ContentCollectionKey = keyof ContentEntryMap;
	export type DataCollectionKey = keyof DataEntryMap;

	type AllValuesOf<T> = T extends any ? T[keyof T] : never;
	type ValidContentEntrySlug<C extends keyof ContentEntryMap> = AllValuesOf<
		ContentEntryMap[C]
	>['slug'];

	/** @deprecated Use `getEntry` instead. */
	export function getEntryBySlug<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(
		collection: C,
		// Note that this has to accept a regular string too, for SSR
		entrySlug: E,
	): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;

	/** @deprecated Use `getEntry` instead. */
	export function getDataEntryById<C extends keyof DataEntryMap, E extends keyof DataEntryMap[C]>(
		collection: C,
		entryId: E,
	): Promise<CollectionEntry<C>>;

	export function getCollection<C extends keyof AnyEntryMap, E extends CollectionEntry<C>>(
		collection: C,
		filter?: (entry: CollectionEntry<C>) => entry is E,
	): Promise<E[]>;
	export function getCollection<C extends keyof AnyEntryMap>(
		collection: C,
		filter?: (entry: CollectionEntry<C>) => unknown,
	): Promise<CollectionEntry<C>[]>;

	export function getEntry<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(entry: {
		collection: C;
		slug: E;
	}): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof DataEntryMap,
		E extends keyof DataEntryMap[C] | (string & {}),
	>(entry: {
		collection: C;
		id: E;
	}): E extends keyof DataEntryMap[C]
		? Promise<DataEntryMap[C][E]>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof ContentEntryMap,
		E extends ValidContentEntrySlug<C> | (string & {}),
	>(
		collection: C,
		slug: E,
	): E extends ValidContentEntrySlug<C>
		? Promise<CollectionEntry<C>>
		: Promise<CollectionEntry<C> | undefined>;
	export function getEntry<
		C extends keyof DataEntryMap,
		E extends keyof DataEntryMap[C] | (string & {}),
	>(
		collection: C,
		id: E,
	): E extends keyof DataEntryMap[C]
		? Promise<DataEntryMap[C][E]>
		: Promise<CollectionEntry<C> | undefined>;

	/** Resolve an array of entry references from the same collection */
	export function getEntries<C extends keyof ContentEntryMap>(
		entries: {
			collection: C;
			slug: ValidContentEntrySlug<C>;
		}[],
	): Promise<CollectionEntry<C>[]>;
	export function getEntries<C extends keyof DataEntryMap>(
		entries: {
			collection: C;
			id: keyof DataEntryMap[C];
		}[],
	): Promise<CollectionEntry<C>[]>;

	export function render<C extends keyof AnyEntryMap>(
		entry: AnyEntryMap[C][string],
	): Promise<RenderResult>;

	export function reference<C extends keyof AnyEntryMap>(
		collection: C,
	): import('astro/zod').ZodEffects<
		import('astro/zod').ZodString,
		C extends keyof ContentEntryMap
			? {
					collection: C;
					slug: ValidContentEntrySlug<C>;
				}
			: {
					collection: C;
					id: keyof DataEntryMap[C];
				}
	>;
	// Allow generic `string` to avoid excessive type errors in the config
	// if `dev` is not running to update as you edit.
	// Invalid collection names will be caught at build time.
	export function reference<C extends string>(
		collection: C,
	): import('astro/zod').ZodEffects<import('astro/zod').ZodString, never>;

	type ReturnTypeOrOriginal<T> = T extends (...args: any[]) => infer R ? R : T;
	type InferEntrySchema<C extends keyof AnyEntryMap> = import('astro/zod').infer<
		ReturnTypeOrOriginal<Required<ContentConfig['collections'][C]>['schema']>
	>;

	type ContentEntryMap = {
		"blog": {
"3-fears-killing-enterprise-deals.md": {
	id: "3-fears-killing-enterprise-deals.md";
  slug: "3-fears-killing-enterprise-deals";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"ai-governance-iso42001-playbook.md": {
	id: "ai-governance-iso42001-playbook.md";
  slug: "ai-governance-iso42001-playbook";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"disp-certification-requirements-australia.md": {
	id: "disp-certification-requirements-australia.md";
  slug: "disp-certification-requirements-australia";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"essential-eight-ml2-vs-ml3-australia.md": {
	id: "essential-eight-ml2-vs-ml3-australia.md";
  slug: "essential-eight-ml2-vs-ml3-australia";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"isms-truths.md": {
	id: "isms-truths.md";
  slug: "isms-truths";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"iso-27001-vs-iso-27701-australia.md": {
	id: "iso-27001-vs-iso-27701-australia.md";
  slug: "iso-27001-vs-iso-27701-australia";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"iso27001-tips.md": {
	id: "iso27001-tips.md";
  slug: "iso27001-tips";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"iso27001-vs-soc2-australia.md": {
	id: "iso27001-vs-soc2-australia.md";
  slug: "iso27001-vs-soc2-australia";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"iso27701-2025.md": {
	id: "iso27701-2025.md";
  slug: "iso27701-2025";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"iso27701-privacy-foundations.md": {
	id: "iso27701-privacy-foundations.md";
  slug: "iso27701-privacy-foundations";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
"soc2-readiness-microsoft-365-saas-australia.md": {
	id: "soc2-readiness-microsoft-365-saas-australia.md";
  slug: "soc2-readiness-microsoft-365-saas-australia";
  body: string;
  collection: "blog";
  data: any
} & { render(): Render[".md"] };
};
"case-studies": {
"fintech-startup.md": {
	id: "fintech-startup.md";
  slug: "fintech-startup";
  body: string;
  collection: "case-studies";
  data: InferEntrySchema<"case-studies">
} & { render(): Render[".md"] };
"gov-qld-is18.md": {
	id: "gov-qld-is18.md";
  slug: "gov-qld-is18";
  body: string;
  collection: "case-studies";
  data: InferEntrySchema<"case-studies">
} & { render(): Render[".md"] };
"health-saas-iso27701.md": {
	id: "health-saas-iso27701.md";
  slug: "health-saas-iso27701";
  body: string;
  collection: "case-studies";
  data: InferEntrySchema<"case-studies">
} & { render(): Render[".md"] };
"network-provider-soc2.md": {
	id: "network-provider-soc2.md";
  slug: "network-provider-soc2";
  body: string;
  collection: "case-studies";
  data: InferEntrySchema<"case-studies">
} & { render(): Render[".md"] };
};

	};

	type DataEntryMap = {
		
	};

	type AnyEntryMap = ContentEntryMap & DataEntryMap;

	export type ContentConfig = typeof import("../../src/content/config.js");
}
