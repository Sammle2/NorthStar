# Dream-to-Action System: Integration Guide

## Overview
Complete implementation of AI-assisted goal management, daily action generation, vision boards, and 3D roadmap visualization for the Fully Alive mobile app.

## Architecture

### Phase 1: Infrastructure ✅ Complete
- ✅ Supabase schema with 7 tables (goals, milestones, steps, daily_actions, vision_board_images, checkpoints, user_settings)
- ✅ Row-level security (RLS) policies for user data isolation
- ✅ Indexes for performance optimization

### Phase 2: Service Layer ✅ Complete

#### supabaseService.js
Handles all database CRUD operations:
- `goals.create()`, `goals.getByUserId()`, `goals.update()`, `goals.delete()`
- `milestones.create()`, `milestones.getByGoalId()`, `milestones.update()`, `milestones.delete()`
- `steps.create()`, `steps.getByMilestoneId()`, `steps.update()`, `steps.delete()`
- `dailyActions.create()`, `dailyActions.getByUserAndDate()`, `dailyActions.update()`, `dailyActions.delete()`
- `visionBoardImages.create()`, `visionBoardImages.getByUserId()`, `visionBoardImages.delete()`
- `checkpoints.create()`, `checkpoints.getByGoalId()`
- `userSettings.getOrCreate()`, `userSettings.update()`, `userSettings.updateApiKey()`

#### aiService.js
Claude API integration for AI suggestions:
- `suggestGoalsFromDream(dreamDescription, numberOfSuggestions)` - Generate 2-3 goals from dream
- `suggestMilestonesForGoal(goalTitle, goalDescription, theme)` - Create 3 timed milestones
- `suggestStepsForMilestone(milestoneTitle, goalTitle, horizon)` - Generate 3-4 stepping stones
- `generateDailyActionsForMilestone(milestoneTitle, goalTitle, numberOfDays, coachTone)` - Create 7-14 daily actions
- `suggestVisionBoardKeywords(goalTitle, goalDescription)` - Get image keywords

#### visionBoardService.js
DALL-E image generation:
- `generateVisionBoardImage(keyword, dalleApiKey, model)` - Generate single image
- `generateVisionBoardForGoal(keywords, dalleApiKey)` - Batch generate images
- `clearImageCache()` - Memory management
- `getCacheStats()` - Image cache info

#### syncService.js
Offline sync with conflict resolution:
- `queueOperation(operation, table, data)` - Add to sync queue
- `getPendingQueue()` - Get unsync'd operations
- `markOperationSynced(operationId)` - Mark as synced
- `resolveConflict(localData, remoteData)` - Timestamp-based winner
- `syncPendingOperations(supabaseService)` - Batch sync to Supabase

#### dailyActionGenerator.js
Auto-generation of daily tasks:
- `generateDailyActionsForMilestone(goal, milestoneIndex, coachTone)` - AI-generated actions
- `getTodaysActions(dailyActions, goal)` - Today's task list
- `calculateDailyProgress(todaysActions)` - Completion percentage
- `getProgressMessage(progress, coachTone)` - Motivational feedback

### Phase 3: UI Components ✅ Complete

#### GoalCreation.js (Screen)
Two-step goal creation flow:
1. **Entry Step**: User enters goals, can add multiple
2. **Suggestions Step**: AI suggests 2-3 additional goals based on dream
3. **Review Step**: User approves/edits before saving

#### MilestonesEditor.js (Component)
Modal for editing milestones and stepping stones:
- Edit 3 timed milestones (3/6/12 months)
- Add/remove/edit stepping stones for each
- AI regeneration of milestones based on goal
- Save with validation

#### DailyActionsPanel.js (Component)
Display and manage today's actions:
- Progress bar showing daily completion
- Tap-to-complete action toggles
- Motivational messages based on progress
- Auto-synced completion status

#### VisionBoard.js (Component)
DALL-E image generation interface:
- Add keywords for vision
- Generate images on-demand
- Responsive grid layout (2 columns)
- Delete individual images
- API key requirement check

#### Roadmap3D.js (Component)
Enhanced 3D roadmap visualization:
- Parallax scrolling effects
- Animated milestone waypoints
- Progress indicators
- Stepping stones display
- Summit achievement celebration

### Phase 4: Data Model Extension ✅ Complete

#### store.js Updates
Extended profile schema:
```javascript
{
  // Existing fields
  name, coachName, coachTone, dreamDescription, dreamStory, etc.

  // New fields
  goals: [],                    // Array of goals with milestones
  dailyActions: [],            // All daily actions
  visionBoardKeywords: [],     // Inspiration keywords
  visionBoardImages: [],       // Generated DALL-E images
  apiKeys: {
    claude: null,              // Claude API key
    dalle: null,               // DALL-E API key
  }
}
```

### Phase 5: Settings Integration ✅ Complete

#### Settings.js Enhancements
Added API key management:
- Claude API key input (masked)
- DALL-E API key input (masked)
- Show/hide password toggles
- Links to API documentation
- Secure storage in Supabase user_settings

## Integration Checklist

### Step 1: Environment Setup
```bash
# Install services if not already present
npm install @react-native-async-storage/async-storage
npm install lucide-react-native

# Ensure tokens.js exists with required colors
# Ensure aiEngine.js is available for mock AI
```

### Step 2: API Key Setup (User)
1. User goes to Settings
2. Enters Claude API key from console.anthropic.com
3. Enters DALL-E API key from platform.openai.com
4. Keys are encrypted and stored in Supabase

### Step 3: Integration Points

#### In Onboarding Flow
After dream reveal, before opening Roadmap:
```javascript
// Show GoalCreation screen
<GoalCreation
  profile={profile}
  onGoalsCreated={(goals) => {
    // Save to Supabase
    // Update local state
  }}
  onCancel={handleSkip}
/>
```

#### In Dashboard
Add DailyActionsPanel above non-negotiables:
```javascript
<DailyActionsPanel
  profile={profile}
  onUpdate={(updated) => {
    // Sync to Supabase
    // Update local state
  }}
/>
```

#### In Roadmap Tab
Replace or enhance with Roadmap3D:
```javascript
<Roadmap3D
  profile={profile}
  selectedGoal={selectedGoalId}
/>
```

#### In Roadmap Screen
For each goal, add MilestonesEditor:
```javascript
<MilestonesEditor
  visible={editingMilestones}
  goal={selectedGoal}
  onSave={(updated) => {
    // Save to Supabase
    // Update local state
  }}
  onCancel={handleClose}
/>
```

Add VisionBoard below goals:
```javascript
<VisionBoard
  goal={selectedGoal}
  visionImages={goalImages}
  onImagesUpdate={(updated) => {
    // Save to Supabase
    // Update local state
  }}
  dalleApiKey={profile.apiKeys?.dalle}
/>
```

### Step 4: Sync Setup

#### Periodic Sync in App.js
```javascript
useEffect(() => {
  const syncInterval = setInterval(async () => {
    if (await syncService.shouldSync()) {
      try {
        const result = await syncService.syncPendingOperations(supabaseService)
        console.log(`Synced: ${result.synced}, Failed: ${result.failed}`)
      } catch (error) {
        console.error('Sync failed:', error)
      }
    }
  }, 60000) // Check every minute

  return () => clearInterval(syncInterval)
}, [])
```

#### Queue Operations on Update
```javascript
// When user updates anything locally
onUpdate(updatedProfile) => {
  // Save locally first
  saveState(updatedProfile)

  // Queue for sync
  if (isOnline()) {
    syncService.queueOperation('UPDATE', 'goals', updatedGoal)
  }

  // Sync immediately if online
  if (isOnline()) {
    syncService.syncPendingOperations(supabaseService)
  }
}
```

### Step 5: Error Handling

#### Missing API Keys
Show helpful message when trying to use AI features:
```javascript
if (!dalleApiKey) {
  Alert.alert(
    'API Key Required',
    'Add your DALL-E API key in Settings to generate images.',
    [{ text: 'Go to Settings', onPress: onOpenSettings }]
  )
}
```

#### Rate Limiting (Claude API)
Already handled in aiService.js with 6.5s spacing and retry logic.

#### DALL-E Rate Limiting
Already handled in visionBoardService.js with 429 error handling and caching.

#### Sync Failures
Queue is persistent - operations retry up to 3 times before being dropped with logging.

## Data Flow

### Creating a Goal
```
User enters goal text
  ↓
GoalCreation requests AI suggestions
  ↓
Claude API suggests 2-3 related goals
  ↓
User approves selection
  ↓
Save goals to Supabase
  ↓
Queue CREATE operations for offline fallback
  ↓
Sync to Supabase
  ↓
Update local profile state
```

### Generating Daily Actions
```
User completes onboarding for a goal
  ↓
System shows MilestonesEditor for first time
  ↓
User edits/approves 3 timed milestones
  ↓
System calls dailyActionGenerator
  ↓
Claude generates 7-14 daily actions
  ↓
Save to Supabase daily_actions table
  ↓
Dashboard displays today's actions
```

### Vision Board Generation
```
User opens VisionBoard component
  ↓
Adds keyword (e.g., "Dubai skyline")
  ↓
Taps "Generate Images"
  ↓
visionBoardService calls DALL-E API
  ↓
Image URL saved to Supabase
  ↓
Displayed in responsive grid
  ↓
User can delete or regenerate
```

## Performance Considerations

1. **Image Caching**: visionBoardService caches generated images to avoid duplicate API calls
2. **Sync Batching**: syncService batches operations (up to queue size) for efficiency
3. **Lazy Loading**: Load goals/milestones on-demand, not all at app start
4. **Pagination**: When showing 20+ images, paginate or virtualize the grid
5. **Offline-First**: Always prioritize local state over network requests

## Security

1. **API Keys**: Stored in Supabase `user_settings` table (encrypted at rest)
2. **RLS Policies**: Each user can only access their own data
3. **Never Log Keys**: aiService and visionBoardService strip keys from error logs
4. **Client-Side Validation**: Check API keys are set before making requests

## Testing Checklist

- [ ] Goal creation with AI suggestions
- [ ] Milestone editing and regeneration
- [ ] Daily action generation and completion
- [ ] Vision board image generation
- [ ] Vision board image deletion
- [ ] Offline operation queueing
- [ ] Online sync of queued operations
- [ ] API key masking in Settings
- [ ] Roadmap3D parallax scrolling
- [ ] Progress calculations across all levels
- [ ] Streak updates on daily action completion

## Next Steps

1. **Integrate GoalCreation into Onboarding flow**
2. **Add MilestonesEditor to goal view**
3. **Add DailyActionsPanel to Dashboard**
4. **Add VisionBoard to goal detail view**
5. **Replace/enhance Roadmap with Roadmap3D**
6. **Set up sync service in App.js**
7. **Test offline-first sync behavior**
8. **Add push notifications for daily actions**
9. **Add analytics tracking for goal progress**
10. **Deploy to Supabase**

## Troubleshooting

### Claude API Errors
- Check ANTHROPIC_API_KEY environment variable
- Verify API key is valid at console.anthropic.com
- Check rate limiting (6.5s between calls)

### DALL-E Errors
- 429: Rate limit exceeded. Wait before retrying.
- 401: Invalid API key. Check platform.openai.com
- Billing not enabled: Enable billing on OpenAI account

### Sync Issues
- Check internet connectivity
- Verify Supabase project is accessible
- Check RLS policies aren't too restrictive
- Review Supabase logs for database errors

### Performance Issues
- Clear image cache: `visionBoardService.clearImageCache()`
- Check AsyncStorage size with `getSizeEstimate()`
- Monitor Supabase query times in dashboard
