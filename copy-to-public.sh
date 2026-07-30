#!/bin/bash
# Run this once to copy index.html into public/ for hosting platforms
mkdir -p public
cp index.html public/index.html
echo "✅ Copied index.html → public/index.html"
echo "Ready to deploy via Vercel, Firebase, or GitHub Pages."
