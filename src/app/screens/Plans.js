import React, { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  ClipboardList,
  Dumbbell,
  Pencil,
  Repeat,
  Trash2,
  Utensils,
  X,
} from 'lucide-react-native'
import { C, F } from '../tokens'
import GlowProgress from '../components/GlowProgress'
import { planKindLabel, planProgress } from '../aiEngine'
import { applyPlanAction } from '../../services/aiService'

const KIND_ICON = { workout: Dumbbell, diet: Utensils, study: BookOpen, habit: Repeat, custom: ClipboardList }

// Compact "updated N ago" line for a plan card.
function timeAgo(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

// My Plans — a full-screen overlay library of the structured plans Nova has built
// (workout, diet, study, anything). List view → tap a plan for the full detail,
// where every item is a checkable row. Rename or delete a plan from its detail.
// Everything writes back onto profile.plans via onUpdate, so it syncs like the
// rest of the app. Opened as an overlay (not a tab) to keep the nav bar clean.
export default function Plans({ profile, onUpdate, onClose, initialPlanId = null }) {
  const plans = profile.plans || []
  const [selectedId, setSelectedId] = useState(
    initialPlanId && plans.some((p) => p.id === initialPlanId) ? initialPlanId : null,
  )
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const selected = plans.find((p) => p.id === selectedId) || null

  // All mutations go through here: map over the current plans and bump updatedAt
  // on the one we touched. Functional updater so a concurrent write never reverts.
  const patchSelected = (fn) => {
    const now = new Date().toISOString()
    onUpdate((prof) => ({
      ...prof,
      plans: (prof.plans || []).map((p) => (p.id === selectedId ? { ...fn(p), updatedAt: now } : p)),
    }))
  }

  const toggleItem = (sectionId, itemId) =>
    patchSelected((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id !== sectionId
          ? s
          : { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)) },
      ),
    }))

  const saveRename = () => {
    const title = renameText.trim().slice(0, 80)
    if (title) patchSelected((p) => ({ ...p, title }))
    setRenaming(false)
  }

  const deleteSelected = () => {
    const id = selectedId
    setSelectedId(null)
    setConfirmDelete(false)
    onUpdate((prof) => ({ ...prof, plans: applyPlanAction(prof.plans, { type: 'remove', planId: id }) || prof.plans }))
  }

  const goBack = () => {
    setSelectedId(null)
    setRenaming(false)
    setConfirmDelete(false)
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 240 }}>
      <View style={{ flex: 1, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 20,
            paddingTop: 56,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: C.line,
          }}
        >
          {selected ? (
            <Pressable onPress={goBack} hitSlop={10}>
              <ArrowLeft size={22} color={C.dim} strokeWidth={2.2} />
            </Pressable>
          ) : (
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={22} color={C.dim} strokeWidth={2.2} />
            </Pressable>
          )}
          <Text style={{ fontFamily: F.display, fontSize: 16, color: C.ink, letterSpacing: 1 }}>
            {selected ? planKindLabel(selected.kind).toUpperCase() : 'MY PLANS'}
          </Text>
        </View>

        {selected ? (
          <PlanDetail
            plan={selected}
            renaming={renaming}
            renameText={renameText}
            confirmDelete={confirmDelete}
            onStartRename={() => {
              setRenameText(selected.title)
              setRenaming(true)
            }}
            onChangeRename={setRenameText}
            onSaveRename={saveRename}
            onToggleItem={toggleItem}
            onAskDelete={() => setConfirmDelete(true)}
            onCancelDelete={() => setConfirmDelete(false)}
            onConfirmDelete={deleteSelected}
          />
        ) : (
          <PlanList plans={plans} onOpen={setSelectedId} />
        )}
      </View>
    </View>
  )
}

// ─── List ─────────────────────────────────────────────────────────────────────
function PlanList({ plans, onOpen }) {
  if (!plans.length) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.lineMid }}>
          <ClipboardList size={28} color={C.violet} strokeWidth={2} />
        </View>
        <Text style={{ fontFamily: F.display, fontSize: 18, color: C.ink, marginTop: 20, letterSpacing: 0.5 }}>No plans yet</Text>
        <Text style={{ fontFamily: F.body, fontSize: 13.5, color: C.faint, marginTop: 10, textAlign: 'center', lineHeight: 21 }}>
          Ask Nova to build you a workout, a diet, a study schedule — anything. It'll be saved here so you can follow it anytime.
        </Text>
      </View>
    )
  }
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 12 }}>
      {plans.map((plan) => {
        const Icon = KIND_ICON[plan.kind] || ClipboardList
        const { done, total } = planProgress(plan)
        return (
          <Pressable
            key={plan.id}
            onPress={() => onOpen(plan.id)}
            style={({ pressed }) => ({
              borderRadius: 18,
              padding: 16,
              backgroundColor: pressed ? 'rgba(167,139,250,0.14)' : C.card,
              borderWidth: 1,
              borderColor: pressed ? C.violet : C.line,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetFill }}>
                <Icon size={21} color={C.violet} strokeWidth={2.1} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 9.5, color: C.violet, letterSpacing: 1.2 }}>{planKindLabel(plan.kind).toUpperCase()}</Text>
                  <Text style={{ fontFamily: F.body, fontSize: 9.5, color: C.faint3 }}>· {timeAgo(plan.updatedAt)}</Text>
                </View>
                <Text style={{ fontFamily: F.medium, fontSize: 15.5, color: C.ink, marginTop: 2 }} numberOfLines={1}>{plan.title}</Text>
                {plan.summary ? (
                  <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, marginTop: 3 }} numberOfLines={2}>{plan.summary}</Text>
                ) : null}
              </View>
            </View>
            {total > 0 && (
              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontFamily: F.body, fontSize: 11, color: C.faint }}>{plan.sections.length} {plan.sections.length === 1 ? 'section' : 'sections'}</Text>
                  <Text style={{ fontFamily: F.semibold, fontSize: 11, color: done === total ? C.green : C.violet }}>{done}/{total} done</Text>
                </View>
                <GlowProgress value={(done / total) * 100} color={done === total ? C.green : C.violet} height={6} />
              </View>
            )}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

// ─── Detail ─────────────────────────────────────────────────────────────────
function PlanDetail({
  plan,
  renaming,
  renameText,
  confirmDelete,
  onStartRename,
  onChangeRename,
  onSaveRename,
  onToggleItem,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}) {
  const Icon = KIND_ICON[plan.kind] || ClipboardList
  const { done, total } = planProgress(plan)
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
      {/* Plan header */}
      <View style={{ borderRadius: 18, padding: 18, backgroundColor: C.violetFill, borderWidth: 1, borderColor: C.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(167,139,250,0.16)' }}>
            <Icon size={23} color={C.violet} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1 }}>
            {renaming ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={renameText}
                  onChangeText={onChangeRename}
                  onSubmitEditing={onSaveRename}
                  autoFocus
                  placeholder="Plan name"
                  placeholderTextColor={C.faint2}
                  style={{ flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: F.medium, fontSize: 16, color: C.ink }}
                />
                <Pressable onPress={onSaveRename} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violet }}>
                  <Check size={16} color={C.amberInk} strokeWidth={2.6} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={onStartRename} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: F.display, fontSize: 21, color: C.ink, letterSpacing: 0.4, lineHeight: 28 }}>{plan.title}</Text>
                <Pencil size={15} color={C.faint} strokeWidth={2} />
              </Pressable>
            )}
            {plan.summary ? (
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, marginTop: 8, lineHeight: 20 }}>{plan.summary}</Text>
            ) : null}
          </View>
        </View>

        {total > 0 && (
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }}>
              <Text style={{ fontFamily: F.body, fontSize: 12, color: C.faint }}>Progress</Text>
              <Text style={{ fontFamily: F.semibold, fontSize: 12, color: done === total ? C.green : C.violet }}>{done}/{total} done</Text>
            </View>
            <GlowProgress value={(done / total) * 100} color={done === total ? C.green : C.violet} height={7} />
          </View>
        )}
      </View>

      {/* Sections */}
      {plan.sections.map((section) => (
        <View key={section.id} style={{ marginTop: 22 }}>
          <Text style={{ fontFamily: F.display, fontSize: 12, color: C.faint, letterSpacing: 2, marginBottom: 12 }}>{section.title.toUpperCase()}</Text>
          <View style={{ gap: 10 }}>
            {section.items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onToggleItem(section.id, item.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 13,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  backgroundColor: item.done ? 'rgba(16,185,129,0.08)' : 'rgba(13,13,27,0.8)',
                  borderWidth: 1,
                  borderColor: item.done ? 'rgba(16,185,129,0.3)' : C.line,
                }}
              >
                {item.done ? (
                  <CheckCircle2 size={22} color={C.green} strokeWidth={2.2} />
                ) : (
                  <Circle size={22} color={C.faint3} strokeWidth={2} />
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: F.medium,
                      fontSize: 14.5,
                      color: item.done ? C.faint : C.ink2,
                      textDecorationLine: item.done ? 'line-through' : 'none',
                    }}
                  >
                    {item.text}
                  </Text>
                  {item.detail ? (
                    <Text style={{ fontFamily: F.body, fontSize: 12.5, color: C.faint, marginTop: 3, lineHeight: 18 }}>{item.detail}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {/* Danger zone — delete with an inline two-tap confirm (cross-platform safe) */}
      <View style={{ marginTop: 30 }}>
        {confirmDelete ? (
          <View style={{ borderRadius: 14, padding: 16, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
            <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: C.ink2, textAlign: 'center' }}>Delete this plan for good?</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable onPress={onCancelDelete} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.lineSoft, borderWidth: 1, borderColor: C.lineStrong }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.dim }}>Keep it</Text>
              </Pressable>
              <Pressable onPress={onConfirmDelete} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.red }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#fff' }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={onAskDelete} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}>
            <Trash2 size={15} color={C.red} strokeWidth={2} />
            <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.red }}>Delete plan</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  )
}
