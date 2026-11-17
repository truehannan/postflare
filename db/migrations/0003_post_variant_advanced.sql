-- Advanced composer fields on post variants: first comment, location tag,
-- and cover-image alt text. Nullable; defaults keep existing rows valid.

ALTER TABLE post_variants ADD COLUMN first_comment TEXT;
ALTER TABLE post_variants ADD COLUMN location TEXT;
ALTER TABLE post_variants ADD COLUMN alt_text TEXT;