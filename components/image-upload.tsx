"use client";

import { useEffect, useState } from "react";

type ImageUploadProps = {
  currentImage?: string | null;
};

export default function ImageUpload({
  currentImage,
}: ImageUploadProps) {
  const [selectedImage, setSelectedImage] =
    useState<{
      fileName: string;
      preview: string;
    } | null>(null);

  const fileName =
    selectedImage?.fileName ??
    "No file selected";

  const preview =
    selectedImage?.preview ??
    currentImage ??
    null;

  useEffect(() => {
    return () => {
      if (selectedImage?.preview) {
        URL.revokeObjectURL(
          selectedImage.preview,
        );
      }
    };
  }, [selectedImage]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];

    if (!file) {
      setSelectedImage(null);
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      alert("Only JPG, PNG or WebP images are allowed.");
      e.target.value = "";
      setSelectedImage(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must not exceed 5 MB.");
      e.target.value = "";
      setSelectedImage(null);
      return;
    }

    setSelectedImage({
      fileName: file.name,
      preview: URL.createObjectURL(file),
    });
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="image"
        className="block text-sm font-medium text-slate-700"
      >
        Product Image
      </label>

      {preview && (
        <img
          src={preview}
          alt="Preview"
          className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
        />
      )}

      <input
        id="image"
        name="image"
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleChange}
        className="w-full rounded-xl border border-slate-300 px-4 py-3"
      />

      <p className="text-sm text-slate-500">
        {fileName}
      </p>

      <p className="text-xs text-slate-400">
        JPG, PNG or WebP • Maximum 5 MB
      </p>
    </div>
  );
}
