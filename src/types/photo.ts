export interface CurrentPhoto {
  blob:     Blob;
  filename: string;
  width:    number;
  height:   number;
}

/**
 * Persisted metadata for a saved photo. The processed JPEG itself lives on
 * disk under `{appDataDir}/FilmApp/photos/{id}.jpg` — never in this object.
 */
export interface PhotoMetadata {
  id:           string;
  filename:     string;
  filterName:   string;
  sliderValues: Record<string, number>;
  dateSaved:    string;
  width:        number;
  height:       number;
}

/**
 * Runtime photo record. `blob` is OPTIONAL — it's only populated when the
 * caller has the data on hand (e.g. just after a save, or after explicitly
 * calling `loadPhotoBlob(id)`). When loaded from disk via `loadAllPhotos`,
 * the array is metadata-only and `blob` is undefined.
 */
export interface PhotoRecord extends PhotoMetadata {
  blob?: Blob;
}
