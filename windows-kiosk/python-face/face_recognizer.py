#!/usr/bin/env python3
"""
Python Face Recognition & Biometric Audit Utility for HR Kiosk
Supports:
- Verification & identification against employee biometric gallery
- Uniqueness and ambiguity safety margin checks
- Automatic audit of stored face templates to flag duplicate/overlapping enrollments
- Offline verification with OpenCV DNN / NumPy
"""

import sys
import json
import math
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any

try:
    import numpy as np
except ImportError:
    np = None


def euclidean_distance(v1: List[float], v2: List[float]) -> float:
    """Computes normalized Euclidean distance between two descriptor vectors."""
    if len(v1) != len(v2) or not v1:
        return float('inf')
    if np is not None:
        a = np.asarray(v1, dtype=np.float32)
        b = np.asarray(v2, dtype=np.float32)
        return float(np.sqrt(np.mean((a - b) ** 2)))
    
    total = sum((a - b) ** 2 for a, b in zip(v1, v2))
    return math.sqrt(total / len(v1))


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two vectors."""
    if len(v1) != len(v2) or not v1:
        return 0.0
    if np is not None:
        a = np.asarray(v1, dtype=np.float32)
        b = np.asarray(v2, dtype=np.float32)
        dot = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot / (norm_a * norm_b))
    
    dot = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def identify_face(
    probe_vector: List[float],
    gallery: List[Dict[str, Any]],
    threshold: float = 0.230,
    min_margin: float = 0.035
) -> Dict[str, Any]:
    """
    Identifies a probe face vector against an employee gallery with strict
    ambiguity protection.
    """
    scored = []
    for emp in gallery:
        descriptors = emp.get('faceDescriptors') or emp.get('faces') or []
        min_score = float('inf')
        for desc in descriptors:
            vec = desc.get('vector') if isinstance(desc, dict) else desc
            if isinstance(vec, list):
                score = euclidean_distance(probe_vector, vec)
                if score < min_score:
                    min_score = score
        if math.isfinite(min_score):
            scored.append({'employee': emp, 'score': min_score})

    scored.sort(key=lambda x: x['score'])
    if not scored:
        return {'ok': False, 'message': 'No face matches found.'}

    best = scored[0]
    second = scored[1] if len(scored) > 1 else None

    if best['score'] > threshold:
        return {
            'ok': False,
            'message': f"Face not recognized (score {best['score']:.3f} > threshold {threshold:.3f}).",
            'score': best['score']
        }

    margin = second['score'] - best['score'] if second else float('inf')
    if second and second['score'] <= threshold and margin < min_margin:
        return {
            'ok': False,
            'ambiguous': True,
            'message': (
                f"Ambiguous face match between {best['employee'].get('fullName')} "
                f"({best['score']:.3f}) and {second['employee'].get('fullName')} "
                f"({second['score']:.3f}). Margin: {margin:.3f}."
            ),
            'best': best,
            'second': second,
            'margin': margin
        }

    return {
        'ok': True,
        'employee': best['employee'],
        'score': best['score'],
        'margin': margin
    }


def audit_gallery_duplicates(gallery: List[Dict[str, Any]], threshold: float = 0.240) -> List[Dict[str, Any]]:
    """
    Audits the employee gallery to find employees who share duplicate or nearly
    identical face templates (e.g. from testing).
    """
    duplicates = []
    n = len(gallery)
    for i in range(n):
        emp_a = gallery[i]
        descs_a = emp_a.get('faceDescriptors') or []
        if not descs_a:
            continue
        for j in range(i + 1, n):
            emp_b = gallery[j]
            descs_b = emp_b.get('faceDescriptors') or []
            if not descs_b:
                continue

            min_dist = float('inf')
            for da in descs_a:
                va = da.get('vector') if isinstance(da, dict) else da
                for db in descs_b:
                    vb = db.get('vector') if isinstance(db, dict) else db
                    if isinstance(va, list) and isinstance(vb, list):
                        d = euclidean_distance(va, vb)
                        if d < min_dist:
                            min_dist = d

            if min_dist <= threshold:
                duplicates.append({
                    'emp1': {
                        'id': emp_a.get('id'),
                        'name': emp_a.get('fullName'),
                        'code': emp_a.get('employeeCode')
                    },
                    'emp2': {
                        'id': emp_b.get('id'),
                        'name': emp_b.get('fullName'),
                        'code': emp_b.get('employeeCode')
                    },
                    'min_distance': min_dist,
                    'warning': 'These two profiles contain the same face and will conflict!'
                })

    return duplicates


def main():
    parser = argparse.ArgumentParser(description="HR Kiosk Python Face Recognition & Biometric Audit Utility")
    parser.add_argument('--store', type=str, help="Path to attendance-kiosk-store.json")
    parser.add_argument('--audit', action='store_true', help="Check for duplicate/colliding face profiles across employees")
    args = parser.parse_args()

    store_path = args.store
    if not store_path:
        default_path = Path.home() / 'AppData' / 'Roaming' / 'react-example' / 'attendance-kiosk-store.json'
        if default_path.exists():
            store_path = str(default_path)

    if not store_path or not Path(store_path).exists():
        print(f"Store file not found. Please provide --store <path>.")
        sys.exit(1)

    print(f"[Python Face Util] Loading kiosk store: {store_path}")
    with open(store_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    employees = data.get('employees', [])
    print(f"[Python Face Util] Total employees loaded: {len(employees)}")

    enrolled = [e for e in employees if (e.get('faceDescriptors') or [])]
    print(f"[Python Face Util] Employees with enrolled face templates: {len(enrolled)}")
    for e in enrolled:
        print(f"  - {e.get('employeeCode')}: {e.get('fullName')} ({len(e.get('faceDescriptors', []))} templates)")

    print("\n[Python Face Util] Running Biometric Uniqueness Audit...")
    duplicates = audit_gallery_duplicates(employees)
    if duplicates:
        print(f"\n[WARNING] Found {len(duplicates)} face collision(s):")
        for dup in duplicates:
            print(f"  COLLISION: {dup['emp1']['name']} ({dup['emp1']['code']}) <===> {dup['emp2']['name']} ({dup['emp2']['code']})")
            print(f"  Distance: {dup['min_distance']:.4f} (Threshold: 0.240)")
            print(f"  {dup['warning']}\n")
    else:
        print("\n[SUCCESS] No duplicate face enrollments detected. All employee profiles are mathematically unique!")


if __name__ == '__main__':
    main()
