// --- AGENT PIPELINE INTERFACES ---

export interface NarrativeBlueprint {
    batch_meta: {
        narrative_state: { current_tension: string; open_loops: string[] }
    };
    episodes: {
        episode_number: number;
        title: string;
        logline: string;
        script: string;
        character_instructions?: Record<string, string>;
        mentioned_chapters?: string[];
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
    narrative_function?: string;
    cause_from?: string;
    effect_to?: string;
    emotional_intensity?: number;
}

export interface MasterBeatSheet {
    visual_strategy: {
        core_atmosphere: string;
        key_lens_design: { opening_hook: string; metaphor: string };
    };
    beats: VisualBeat[];
}
