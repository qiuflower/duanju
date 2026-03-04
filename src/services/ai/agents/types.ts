// --- AGENT PIPELINE INTERFACES ---

export interface NarrativeBlueprint {
    batch_meta: {
        narrative_state: { current_tension: string; open_loops: string[] }
    };
    episodes: {
        episode_number: number;
        title: string;
        logline: string;
        structure_breakdown: {
            hook_0_15s: { narrative_action: string; visual_intent: string; connection_to_prev?: string };
            incident_15_60s: { narrative_action: string; pacing?: string };
            rising_action_60_180s: { key_beats: string[] };
            climax_spectacle_180_240s: { narrative_action: string; visual_spectacle_requirement: string; emotional_tone?: string };
            cliffhanger_last_15s: { narrative_action: string; question_posed: string };
        };
        character_instructions: Record<string, string>;
    }[];
}

export interface VisualBeat {
    beat_id: string;
    shot_id: string;
    shot_name?: string;
    visual_action: string;
    camera_movement: string;
    lighting: string;
    audio_subtext: string;
    asset_ids?: string[];
}

export interface MasterBeatSheet {
    visual_strategy: {
        core_atmosphere: string;
        key_lens_design: { opening_hook: string; metaphor: string };
    };
    beats: VisualBeat[];
}
