-- Add ros_version column to hotspots table for RouterOS version detection
ALTER TABLE public.hotspots ADD COLUMN IF NOT EXISTS ros_version TEXT DEFAULT 'auto';

-- Add check constraint for valid values
ALTER TABLE public.hotspots DROP CONSTRAINT IF EXISTS hotspots_ros_version_check;
ALTER TABLE public.hotspots ADD CONSTRAINT hotspots_ros_version_check 
  CHECK (ros_version IN ('6', '7', 'auto'));

-- Add comment for documentation
COMMENT ON COLUMN public.hotspots.ros_version IS 'RouterOS version: 6 (legacy), 7 (optimized), auto (detect at runtime)';