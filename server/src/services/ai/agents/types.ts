export interface Beat {
    beat_id: string;
    shot_id: string;
    shot_name?: string;
    visual_action: string;
    camera_movement: string;
    lighting: string;
    audio_subtext: string;
    asset_ids?: string[];
    narrative_function: string;
    cause_from: string;
    emotional_intensity: number;
}

export interface MasterBeatSheet {
    visual_strategy?: {
        core_atmosphere: string;
        key_lens_design: {
            opening_hook: string;
            metaphor: string;
        };
    };
    beats: Beat[];
}

export interface NarrativeBlueprint {
    batch_meta?: {
        narrative_state?: {
            current_tension: string;
            open_loops: string[];
        };
        batch_info?: {
            batch_index: number;
            total_batches: number;
            episode_range: string;
            timestamp: string;
        };
    };
    episodes: Array<{
        episode_number: number;
        title: string;
        logline?: string;
        script?: string;
        character_instructions?: Record<string, string>;
        mentioned_chapters?: string[];
    }>;
}
