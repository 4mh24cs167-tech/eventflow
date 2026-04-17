-- Category Scheduling System Migration
-- NOTE: Make sure the base schema.sql has been run first!
-- This migration requires: users, departments, categories, subcategories tables to exist.

-- Step 1: Create the table WITHOUT foreign keys first
CREATE TABLE IF NOT EXISTS category_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL,
    subcategory_id UUID,
    department_id UUID NOT NULL,
    scheduled_month INTEGER NOT NULL CHECK (scheduled_month >= 1 AND scheduled_month <= 12),
    scheduled_year INTEGER NOT NULL,
    academic_year TEXT NOT NULL,
    created_by UUID NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Disable RLS
ALTER TABLE category_schedules DISABLE ROW LEVEL SECURITY;

-- Step 3: Add indexes
CREATE INDEX IF NOT EXISTS idx_schedules_dept_year ON category_schedules(department_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_schedules_category ON category_schedules(category_id);
