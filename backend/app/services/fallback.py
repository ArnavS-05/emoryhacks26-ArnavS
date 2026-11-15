"""Deterministic fallbacks used when Gemini is unavailable. Always labelled `fallback:*`."""
from __future__ import annotations

import re

from ..schemas import Intent, QuestionInterpretation, ResponseType

RULES: list[tuple[str, Intent, ResponseType, list[str], str]] = [
    (r"\b(where|which part|what part|location|point to)\b.*\b(pain|hurt|ache|sore|discomfort)", Intent.pain_location,
     ResponseType.body_location, ["pain"], "pain location body area"),
    (r"\b(pain|hurt|ache|sore)\b.*\b(where)\b", Intent.pain_location, ResponseType.body_location, ["pain"], "pain location body area"),
    (r"\b(how (bad|much|severe|strong)|rate|scale|out of (10|ten)|intensity)\b", Intent.pain_intensity,
     ResponseType.scale, ["pain"], "pain intensity severity"),
    (r"\b(what (does|kind)|describe|feel like|sharp|dull|type of pain)\b", Intent.pain_quality,
     ResponseType.choice, ["pain"], "pain quality sharp dull burning"),
    (r"\b(when did|how long|since when|started|getting (worse|better))\b", Intent.pain_timing,
     ResponseType.choice, ["pain"], "pain timing started worse better"),
    (r"\b(breath|breathing|breathe|short of breath|oxygen|chest tight)\b", Intent.breathing,
     ResponseType.choice, ["breathing", "urgent"], "breathing breathe oxygen"),
    (r"\b(allerg)", Intent.allergy, ResponseType.choice, ["medication"], "allergic medicine allergy reaction"),
    (r"\b(medic|pill|tablet|dose|prescription|drug)", Intent.medication, ResponseType.choice,
     ["medication"], "medicine taking dose side effect"),
    (r"\b(eat|drink|hungry|thirsty|food|water|swallow)\b", Intent.nutrition, ResponseType.choice,
     ["eating_drinking"], "hungry thirsty food drink"),
    (r"\b(toilet|bathroom|restroom|bedpan|wash|clean)\b", Intent.hygiene, ResponseType.choice, ["hygiene"], "toilet wash"),
    (r"\b(move|walk|stand|sit up|turn over|position)\b", Intent.mobility, ResponseType.choice,
     ["movement", "comfort"], "move position walk"),
    (r"\b(comfortable|comfort|cold|hot|warm|blanket|pillow)\b", Intent.comfort, ResponseType.choice, ["comfort"], "comfortable position"),
    (r"\b(feel(ing)?|mood|scared|worried|anxious|sad)\b.*\b(emotion|today|now|about)?", Intent.feelings,
     ResponseType.choice, ["feelings"], "feel scared sad okay"),
    (r"\b(symptom|nause|dizzy|sick|fever|vomit)", Intent.symptom_check, ResponseType.choice,
     ["symptoms"], "symptoms nausea dizzy"),
    (r"^(are|is|do|does|did|have|has|can|could|will|would|should)\b", Intent.yes_no, ResponseType.yes_no,
     ["general"], "yes no"),
]


def classify(text: str) -> tuple[QuestionInterpretation, str]:
    t = text.lower().strip()
    for pattern, intent, rtype, cats, query in RULES:
        if re.search(pattern, t):
            return QuestionInterpretation(
                intent=intent, response_type=rtype, topic=intent.value.replace("_", " "),
                search_query=query, categories=cats, simplified_question=text,
                translated_question="", translated_simplified="", confidence=0.55,
            ), "fallback:rules"
    return QuestionInterpretation(
        intent=Intent.unclear, response_type=ResponseType.choice, topic="general",
        search_query=" ".join(re.findall(r"[a-z]{4,}", t)[:6]) or "help",
        categories=["general", "questions"], simplified_question=text, confidence=0.2,
        needs_clarification=True,
    ), "fallback:rules"
