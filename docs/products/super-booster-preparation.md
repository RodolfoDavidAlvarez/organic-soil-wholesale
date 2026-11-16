# Super Booster preparation — November 24, 2026

Status: development-only preview at /__preview/super-booster. Production build removes the preview import/route. No catalog, price, stock, existing public product or launch scheduling changes.

Brand: Super Booster. Generic name: Organic Concentrate. These follow the user's direct November 16 instructions.

Ingredients start with the organic-concentrate component from the finalized PlantPal Plus label: chicken compost, SKM, zeolite, biochar, kelp meal, azomite, cyanobacteria, mycorrhizae. Compost and worm castings are included per the user's explicit instruction. The draft does NOT copy the full PlantPal potting-soil recipe.

Existing API product /api/public/products/superbooster (id 4000) and repository JSON establish that this is an amendment, not standalone potting soil. Existing texture photo is used. The old API has a different, longer ingredient list and an old 1:4 mixing rate; those were not silently copied as final launch directions for the newly confirmed formulation.

Needs confirmation before launch: complete final ingredient wording (including compost type and meaning of SKM), approved directions/rates and safety text for this formulation, final sizes, prices, stock, current certification evidence and final packaging. No NPK or percentages added. User clarified launch date November 24, not September 24.

To preview: load production VITE environment through local environment configuration and run Vite on the client, then open /__preview/super-booster. New component: client/src/pages/SuperBoosterPreview.tsx. Layout shared with Garden Craft.

## Verified packaging references

Added actual local “9 lb Product Photos/SuperBooster (1).jpg” studio photograph and “SSWSuperBoosterLabels9lbs.pdf” from Airtable product recI5nDJGbZMRZSFC, Current labels, attachment attPTnUJaT0tn6GMx. Both are in the development-only gallery after the texture photo. The PDF and studio photo show the older label; do not mistake its claims, old contact number, nutrient analysis or usage rates for newly approved launch copy. Gallery assets live under client/src/assets/super-booster-preview and are excluded from production when the dev-only import is removed.
