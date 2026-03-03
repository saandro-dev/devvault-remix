/**
 * vault-crud/handlers/dependencies.ts — Delegates dependency actions.
 *
 * Re-exports handlers from _shared/dependency-helpers.ts for use
 * in the vault-crud action router.
 */

export {
  handleAddDependency,
  handleRemoveDependency,
  handleListDependencies,
} from "../../_shared/dependency-helpers.ts";
