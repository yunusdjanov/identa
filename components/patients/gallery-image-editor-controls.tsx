'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/components/providers/i18n-provider';
import { Crop, MousePointer2, PenLine, RotateCcw, RotateCw, Save, Type, Undo2 } from 'lucide-react';
import {
    ADJUSTMENT_STEP_PERCENT,
    COLOR_SWATCHES,
    MAX_STRAIGHTEN_ROTATION_DEGREES,
    MAX_ADJUSTMENT_PERCENT,
    MIN_STRAIGHTEN_ROTATION_DEGREES,
    MIN_ADJUSTMENT_PERCENT,
    MIN_CROP_SIZE,
    STRAIGHTEN_ROTATION_STEP_DEGREES,
    type CropRect,
    type EditMode,
} from './gallery-image-editor-types';

interface GalleryImageEditorControlsProps {
    mode: EditMode;
    onModeChange: (mode: EditMode) => void;
    brightness: number;
    onBrightnessChange: (value: number) => void;
    contrast: number;
    onContrastChange: (value: number) => void;
    straightenRotation: number;
    onStraightenRotationChange: (value: number) => void;
    drawSize: number;
    onDrawSizeChange: (value: number) => void;
    textSize: number;
    onTextSizeChange: (value: number) => void;
    drawColor: string;
    onDrawColorChange: (value: string) => void;
    draftCropRect: CropRect | null;
    cropRect: CropRect | null;
    onApplyCrop: () => void;
    onResetCrop: () => void;
    canUndo: boolean;
    onUndo: () => void;
    onReset: () => void;
    onCancel: () => void;
    onSave: () => void;
    onRotateLeft: () => void;
    onRotateRight: () => void;
    isEditingDisabled: boolean;
    isSaveBusy: boolean;
}

function modeButtonClass(isActive: boolean): string {
    return isActive
        ? 'bg-teal-400 text-slate-950 hover:bg-teal-300'
        : 'border-white/10 bg-white/10 text-white hover:bg-white/15 hover:text-white';
}

function ModeButton({
    mode,
    activeMode,
    label,
    icon,
    disabled,
    onClick,
}: {
    mode: EditMode;
    activeMode: EditMode;
    label: string;
    icon: ReactNode;
    disabled: boolean;
    onClick: (mode: EditMode) => void;
}) {
    return (
        <Button
            type="button"
            variant={activeMode === mode ? 'default' : 'outline'}
            size="sm"
            className={modeButtonClass(activeMode === mode)}
            onClick={() => onClick(mode)}
            disabled={disabled}
            aria-pressed={activeMode === mode}
        >
            {icon}
            {label}
        </Button>
    );
}

/** Renders the image-editing toolbar without owning editor state. */
export function GalleryImageEditorControls({
    mode,
    onModeChange,
    brightness,
    onBrightnessChange,
    contrast,
    onContrastChange,
    straightenRotation,
    onStraightenRotationChange,
    drawSize,
    onDrawSizeChange,
    textSize,
    onTextSizeChange,
    drawColor,
    onDrawColorChange,
    draftCropRect,
    cropRect,
    onApplyCrop,
    onResetCrop,
    canUndo,
    onUndo,
    onReset,
    onCancel,
    onSave,
    onRotateLeft,
    onRotateRight,
    isEditingDisabled,
    isSaveBusy,
}: GalleryImageEditorControlsProps) {
    const { t } = useI18n();
    const canApplyCrop = Boolean(
        draftCropRect && draftCropRect.width >= MIN_CROP_SIZE && draftCropRect.height >= MIN_CROP_SIZE
    );
    const sharedButtonClass = 'border-white/10 bg-white/10 text-white hover:bg-white/15 hover:text-white';

    return (
        <div className="border-t border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <ModeButton mode="adjust" activeMode={mode} label={t('gallery.edit.adjust')} icon={<MousePointer2 className="mr-1.5 h-4 w-4" />} disabled={isEditingDisabled} onClick={onModeChange} />
                    <ModeButton mode="crop" activeMode={mode} label={t('gallery.edit.crop')} icon={<Crop className="mr-1.5 h-4 w-4" />} disabled={isEditingDisabled} onClick={onModeChange} />
                    <ModeButton mode="draw" activeMode={mode} label={t('gallery.edit.draw')} icon={<PenLine className="mr-1.5 h-4 w-4" />} disabled={isEditingDisabled} onClick={onModeChange} />
                    <ModeButton mode="text" activeMode={mode} label={t('gallery.edit.text')} icon={<Type className="mr-1.5 h-4 w-4" />} disabled={isEditingDisabled} onClick={onModeChange} />
                    <Button type="button" variant="outline" size="sm" className={sharedButtonClass} onClick={onRotateLeft} disabled={isEditingDisabled}>
                        <RotateCcw className="mr-1.5 h-4 w-4" />
                        {t('gallery.edit.rotateLeft')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className={sharedButtonClass} onClick={onRotateRight} disabled={isEditingDisabled}>
                        <RotateCw className="mr-1.5 h-4 w-4" />
                        {t('gallery.edit.rotateRight')}
                    </Button>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        {mode === 'crop' ? (
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-white/75">
                                    {t('gallery.edit.straighten')}: {straightenRotation}°
                                </Label>
                                <input
                                    type="range"
                                    aria-label={t('gallery.edit.straighten')}
                                    value={straightenRotation}
                                    min={MIN_STRAIGHTEN_ROTATION_DEGREES}
                                    max={MAX_STRAIGHTEN_ROTATION_DEGREES}
                                    step={STRAIGHTEN_ROTATION_STEP_DEGREES}
                                    onChange={(event) => onStraightenRotationChange(Number(event.target.value))}
                                    disabled={isEditingDisabled}
                                    className="h-2 w-full cursor-pointer accent-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        ) : null}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-white/75">
                                {t('gallery.edit.brightness')}: {brightness}%
                            </Label>
                            <input
                                type="range"
                                value={brightness}
                                min={MIN_ADJUSTMENT_PERCENT}
                                max={MAX_ADJUSTMENT_PERCENT}
                                step={ADJUSTMENT_STEP_PERCENT}
                                onChange={(event) => onBrightnessChange(Number(event.target.value))}
                                disabled={isEditingDisabled}
                                className="h-2 w-full cursor-pointer accent-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-white/75">
                                {t('gallery.edit.contrast')}: {contrast}%
                            </Label>
                            <input
                                type="range"
                                value={contrast}
                                min={MIN_ADJUSTMENT_PERCENT}
                                max={MAX_ADJUSTMENT_PERCENT}
                                step={ADJUSTMENT_STEP_PERCENT}
                                onChange={(event) => onContrastChange(Number(event.target.value))}
                                disabled={isEditingDisabled}
                                className="h-2 w-full cursor-pointer accent-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-white/75">
                                {t('gallery.edit.size')}: {mode === 'text' ? textSize : drawSize}
                            </Label>
                            <input
                                type="range"
                                value={mode === 'text' ? textSize : drawSize}
                                min={mode === 'text' ? 18 : 2}
                                max={mode === 'text' ? 72 : 18}
                                step={1}
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    if (mode === 'text') {
                                        onTextSizeChange(value);
                                    } else {
                                        onDrawSizeChange(value);
                                    }
                                }}
                                disabled={isEditingDisabled || mode === 'crop' || mode === 'adjust'}
                                className="h-2 w-full cursor-pointer accent-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-white/75">
                                {t('gallery.edit.color')}
                            </Label>
                            <div className="flex gap-2">
                                {COLOR_SWATCHES.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => onDrawColorChange(color)}
                                        disabled={isEditingDisabled || mode === 'crop' || mode === 'adjust'}
                                        className={`h-7 w-7 rounded-full border shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                            drawColor === color ? 'border-teal-300 ring-2 ring-teal-300' : 'border-white/30'
                                        }`}
                                        style={{ backgroundColor: color }}
                                        aria-label={`${t('gallery.edit.color')} ${color}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {mode === 'crop' ? (
                            <>
                                <Button type="button" variant="outline" size="sm" className={sharedButtonClass} onClick={onApplyCrop} disabled={isEditingDisabled || !canApplyCrop}>
                                    {t('gallery.edit.applyCrop')}
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="text-white/75 hover:bg-white/10 hover:text-white" onClick={onResetCrop} disabled={isEditingDisabled || (!cropRect && !draftCropRect)}>
                                    {t('gallery.edit.resetCrop')}
                                </Button>
                            </>
                        ) : null}
                        {(mode === 'draw' || mode === 'text') ? (
                            <Button type="button" variant="ghost" size="sm" className="text-white/75 hover:bg-white/10 hover:text-white" onClick={onUndo} disabled={isEditingDisabled || !canUndo}>
                                <Undo2 className="mr-1.5 h-4 w-4" />
                                {t('gallery.edit.undo')}
                            </Button>
                        ) : null}
                        <Button type="button" variant="ghost" size="sm" className="text-white/75 hover:bg-white/10 hover:text-white" onClick={onReset} disabled={isEditingDisabled}>
                            {t('gallery.edit.reset')}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="text-white/75 hover:bg-white/10 hover:text-white" onClick={onCancel} disabled={isSaveBusy}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="button" size="sm" className="bg-teal-500 text-slate-950 hover:bg-teal-400" onClick={onSave} disabled={isEditingDisabled}>
                            <Save className="mr-1.5 h-4 w-4" />
                            {isSaveBusy ? t('gallery.edit.saving') : t('gallery.edit.saveOriginal')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
