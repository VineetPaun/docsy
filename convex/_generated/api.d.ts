/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audioOverviews from "../audioOverviews.js";
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cascade from "../lib/cascade.js";
import type * as lib_rateLimitWindow from "../lib/rateLimitWindow.js";
import type * as messages from "../messages.js";
import type * as notebooks from "../notebooks.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audioOverviews: typeof audioOverviews;
  documents: typeof documents;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/cascade": typeof lib_cascade;
  "lib/rateLimitWindow": typeof lib_rateLimitWindow;
  messages: typeof messages;
  notebooks: typeof notebooks;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
