import type { Metadata } from "next";
import { ImageSorter } from "./image-sorter";

export const metadata: Metadata = {
  title: "Sortlight — Local image sorter",
  description:
    "Review, tag, and sort a folder of images with fast, customizable keyboard shortcuts.",
};

export default function Home() {
  return <ImageSorter />;
}
