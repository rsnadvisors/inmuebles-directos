# Private draft property images

This change is staged in a branch. The migration must be applied to production
only in a separately authorized rollout with verified backup and recovery.

## Data and delivery contract

- Existing `property_images` rows inherit `storage_bucket = 'property-images'`.
  Their `public_url` values, including external image URLs, remain unchanged.
  The existing public bucket and all legacy objects stay in place.
- New uploads use the non-public `property-images-private` bucket. Their metadata
  records `storage_bucket`, `storage_path`, and `public_url = NULL`. The object
  path is derived from authenticated user ID, property ID and a random UUID.
- During draft, the owner may read the object directly under Storage RLS or via
  `/api/property-images/[imageId]/preview`. This preview checks the verified
  session, image/property relationship, owner ID and draft status.
- After finalization, `/api/property-images/[imageId]` uses an anonymous
  Supabase client, checks the image and published property, and downloads the
  still-private object under Storage RLS. It never uses `service_role` or a
  stored signed URL. The same stable route supplies cards, drawer, full page
  and absolute Open Graph image metadata.
- The published-object Storage `SELECT` policy permits only the exact
  authenticated-object download operation. Anonymous clients can download a
  published image by path but cannot list the private bucket. The delivery
  route also validates the private bucket, linked property/owner IDs, and the
  canonical three-segment UUID image path before fetching bytes.

Both routes send `Cache-Control: no-store`; the draft preview additionally
sends `private`. This deliberately trades CDN caching for the guarantee that
a prior response cannot outlive a status/authorization change. The legacy
public URLs retain their existing caching behavior.

## Publication and failures

The finalization RPC still checks owner, draft state, complete property fields,
one to five image rows, owner/property path, MIME type, size and the existence
of every Storage object before changing status in a database transaction. Its
new-image branch requires the private bucket and a null public URL. There is
no cross-system copy or move at publication time.

The API attempts cleanup only while the listing remains a draft. If the RPC
response is lost, it reads the property's current status before cleanup. After
publication, it verifies the primary image through the same anonymous delivery
contract. A temporary delivery failure returns `DELIVERY_UNCERTAIN` and leaves
the committed property alone; the user must inspect `Mis propiedades` before
retrying. The API never repeats a write automatically.

## Rollout and recovery boundary

Before applying this migration to production, verify the exact current schema,
policies, backup artifact and SHA-256, restore capability, migration history,
and a no-write staging rehearsal. Deploy the dual reader only after the new
bucket/policies and RPC are applied. A deployment of this branch alone is not
safe because its queries require `storage_bucket`.

Before the first private-backed production image, an emergency application
rollback may disable new private uploads. After the first such image, keep a
dual-reading application deployed until every private-backed image is safely
resolvable. Never delete the private bucket during rollback. Do not revert to
code that assumes every image has a non-null `public_url`.

The legacy public bucket cannot retroactively make its bytes private. The new
migration removes ordinary owner draft uploads to that bucket and limits agent
uploads there to already published managed properties; it does not move or
rewrite existing published images.
