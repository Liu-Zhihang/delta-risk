"""
RCCU – River-Constrained Corridor Urbanization Simulator
========================================================

Modular simulation framework for modelling the emergence of
river-constrained corridor urbanization in river-delta landscapes.

Architecture inspired by Salesforce AI-Economist; physics inspired
by the Allen–Cahn / Cahn–Hilliard family of field theories.

Modules
-------
config      Palettes, physical parameters, rendering presets.
delta       Procedural delta-landscape generator (branching rivers,
            polders, ecological reserves, embankments).
engine      PDE integration engine (anisotropic Allen–Cahn + driving/constraint).
viz         Publication-quality dark-theme renderer with multi-layer compositing.
metrics     Order-parameter diagnostics (corridor ratio, phase fraction, …).
bridge      Adapter for ingesting real GeoTIFF / Shapefile data.
"""

__version__ = "0.2.0"
