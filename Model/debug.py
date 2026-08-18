
"""
Run this script from your venv to find the correct mediapipe import path.
    python debug_mediapipe.py
"""
import pkgutil
import mediapipe

print("mediapipe location:", mediapipe.__file__)
print("\nTop-level submodules:")
for mod in pkgutil.iter_modules(mediapipe.__path__):
    print(" ", mod.name)

# Try common paths and report which ones work
paths_to_try = [
    "mediapipe.solutions.face_mesh",
    "mediapipe.python.solutions.face_mesh",
    "mediapipe.tasks.python.vision.face_landmarker",
]

print("\nImport probe:")
for path in paths_to_try:
    try:
        __import__(path)
        print(f"  OK  → {path}")
    except Exception as e:
        print(f"  FAIL→ {path}  ({e})")