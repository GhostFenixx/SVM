"use strict";

class MainSVM {
  preSptLoad(container) {
    const Logger = container.resolve("WinstonLogger");
    try { //Checking for loader.json, if doesn't exist - throw a message, disable the mod.
      const PresetLoader = require('../Loader/loader.json');
      if (PresetLoader.CurrentlySelectedPreset == null || PresetLoader.CurrentlySelectedPreset == "null") {
        Logger.warning("[SVM] Null Preset detected, SVM is disabled, Most likely you're running this mod for the first time, head to the SVM mod folder and run the Greed.exe");
        return
      }
      const Config = require('../Presets/' + PresetLoader.CurrentlySelectedPreset + '.json');
    }
    catch (e) {
      const Logger = container.resolve("WinstonLogger");
      Logger.warning("\n[SVM] SVM is lacking loader file or there is an error, mod is disabled\n" +
        "Most likely you're running this mod for the first time, head to the SVM mod folder and run the Greed.exe\n" +
        "Don't forget to apply your changes...Really, hit that Apply button, it will create loader file\n" +
        "[SVM] If it's Syntax error, edit it manually in loader.json or/and edit values with UIs properly\n" +
        "Exception message below may help you distinguish what went wrong:\n");
      Logger.error(e.message + "\n");
      return
    }

    const PresetLoader = require('../Loader/loader.json');
    const Config = require('../Presets/' + PresetLoader.CurrentlySelectedPreset + '.json');
    const StaticRouterModService = container.resolve("StaticRouterModService");
    const HttpResponse = container.resolve("HttpResponseUtil");
    const repeatableQuestController = container.resolve("RepeatableQuestController");

    //PRE LOAD - QUESTS SECTION
    if (Config.Quests.EnableQuests && Config.Quests.EnableQuestsMisc)//Horrible, as usual
    {
      try {
        container.afterResolution("QuestCallbacks", (_t, result) => {
          result.activityPeriods = (url, info, sessionID) => {
            let Edited = repeatableQuestController.getClientRepeatableQuests(sessionID);
            for (let quests in Edited) {
              for (let act in Edited[quests].activeQuests) {//this needs to be trimmed as well, eventually.
                if (Edited[quests].activeQuests[act].changeCost[0].count !== undefined) {
                  Edited[quests].activeQuests[act].changeCost[0].count = 5000 * Config.Quests.QuestCostMult;
                }
                if (Config.Quests.QuestRepToZero) {
                  Edited[quests].activeQuests[act].changeStandingCost = 0;
                }
              }
              for (let inact in Edited[quests].inactiveQuests) {
                if (Edited[quests].inactiveQuests[inact].changeCost[0].count !== undefined) {
                  Edited[quests].inactiveQuests[inact].changeCost[0].count = 5000 * Config.Quests.QuestCostMult;
                }
                if (Config.Quests.QuestRepToZero) {
                  Edited[quests].inactiveQuests[inact].changeStandingCost = 0;
                }
              }
              for (let req in Edited[quests].changeRequirement) {
                Edited[quests].changeRequirement[req].changeCost[0].count = 5000 * Config.Quests.QuestCostMult;
                if (Config.Quests.QuestRepToZero) {
                  Edited[quests].changeRequirement[req].changeStandingCost = 0;
                }
              }
            }
            return HttpResponse.getBody(Edited);
          }
        }, { frequency: "Always" });

        container.afterResolution("QuestCallbacks", (_t, result) => {
          result.changeRepeatableQuest = (pmcData, body, sessionID) => {
            //const repeatableQuestController = container.resolve("RepeatableQuestController");
            let Edited = repeatableQuestController.changeRepeatableQuest(pmcData, body, sessionID);
            for (let quests in Edited.profileChanges) {
              for (let test in Edited.profileChanges[quests].repeatableQuests[0].changeRequirement) {
                Edited.profileChanges[quests].repeatableQuests[0].changeRequirement[test].changeCost[0].count = 5000 * Config.Quests.QuestCostMult;
                if (Config.Quests.QuestRepToZero) {
                  Edited.profileChanges[quests].repeatableQuests[0].changeRequirement[test].changeStandingCost = 0;
                }
              }
            }
            return Edited;
          }
        }, { frequency: "Always" });
      }
      catch (e) {
        Logger.error("[SVM] REPEATABLE QUEST HANDLED EXCEPTION - Something wrong attempting to change quest reroll price\n" + e.message + "\n");
      }
    }
    //PRE LOAD - RAIDS SECTION
    if (Config.Raids.RaidEvents.Halloween || Config.Raids.RaidEvents.Christmas)//Extra check, just in case
    {
      StaticRouterModService.registerStaticRouter("EventOverride",
        [
          {
            url: "/client/game/version/validate",
            action: (url, info, sessionID) => {
              const DB = container.resolve("DatabaseService");
              const globalConfig = DB.getGlobals().config;
              const configServer = container.resolve("ConfigServer");
              const SeasonalEventService = container.resolve("SeasonalEventService");
              const Events = configServer.getConfig("spt-seasonalevents");

              //let event = [];
              if (Config.Raids.RaidEvents.Christmas) {
                SeasonalEventService.updateGlobalEvents(globalConfig, Events.events[1]);
              }
              if (Config.Raids.RaidEvents.Halloween) {
                SeasonalEventService.updateGlobalEvents(globalConfig, Events.events[0]);
              }
              return HttpResponse.nullResponse();
            }
          }
        ], "spt");
    }
    if (Config.Hideout.EnableHideout) {
      if (Config.Hideout.Regeneration.OfflineRegen) {
        container.afterResolution("GameController", (_t, result) => {
          result.updateProfileHealthValues = (url, info, sessionID) => {
          }
        }, { frequency: "Always" });
      }
    }

    if (Config.Raids.SafeExit) {
      container.afterResolution("MatchCallbacks", (_t, result) => {
        result.endLocalRaid = (url, info, sessionID) => {
          if (info.results.result == "Left") {
            info.results.result = "Runner"
          }
          const MatchController = container.resolve("MatchController");
          MatchController.endLocalRaid(sessionID, info);
          return HttpResponse.nullResponse();
        }
      }, { frequency: "Always" });
    }
    if (Config.Raids.SaveGearAfterDeath) {
      container.afterResolution("MatchCallbacks", (_t, result) => {
        result.endLocalRaid = (url, info, sessionID) => {
          if (info.results.result !== "Survived") {
            info.results.result = "Runner"
          }
          const MatchController = container.resolve("MatchController");
          MatchController.endLocalRaid(sessionID, info);
          return HttpResponse.nullResponse();
        }
      }, { frequency: "Always" });
    }
    //PRE LOAD - CSM SECTION
    //Attempt to fix pockets if custom is not present
    StaticRouterModService.registerStaticRouter("Revive Pockets",
      [
        {
          url: "/client/game/version/validate",
          action: (url, info, sessionID) => {
            let pmcData = container.resolve("ProfileHelper").getPmcProfile(sessionID);
            let pockets;
            try {
              if (pmcData.Info.GameVersion == "unheard_edition") {
                pockets = "65e080be269cbd5c5005e529";
              }
              else {
                pockets = "627a4e6b255f7527fb05a0f6";
              }
              pmcData.Inventory.items.forEach((item) => {
                if (item.slotId == "Pockets" && item._tpl == "a8edfb0bce53d103d3f62b9b") {
                  item._tpl = pockets;
                }
              })
              return HttpResponse.nullResponse();
            }
            catch (e) {
              Logger.error("[SVM] CSM CUSTOM POCKETS - New profile detected, Cancelling function, restart the game to fix it.\n" + e.message)
              return HttpResponse.nullResponse();
            }
          }
        }], "spt");
    if (Config.CSM.EnableCSM && Config.CSM.CustomPocket) {
      StaticRouterModService.registerStaticRouter("CustomPocket",
        [
          {
            url: "/client/game/version/validate",
            action: (url, info, sessionID) => {
              let pmcData = container.resolve("ProfileHelper").getPmcProfile(sessionID);
              try {
                pmcData.Inventory.items.forEach((item) => {
                  if (item.slotId == "Pockets") {
                    item._tpl = "a8edfb0bce53d103d3f62b9b";
                  }
                })
                return HttpResponse.nullResponse();
              }
              catch (e) {
                Logger.error("[SVM] CSM CUSTOM POCKETS - New profile detected, Cancelling function, restart the game to fix it.\n" + e.message)
                return HttpResponse.nullResponse();
              }
            }
          }], "spt");
    }
    //HEALTH + SCAV FUNCTIONS
    if (Config.Player.EnableHealth || Config.Scav.EnableScavHealth || Config.Scav.ScavCustomPockets || Config.Player.EnableStats || Config.Scav.EnableStats) //TO OVERRIDE HEALTH, STATS + CURRENT SCAV HEALTH, STATS AND POCKETS BEFORE RAID
    {
      StaticRouterModService.registerStaticRouter("EditHealth",
        [
          {
            url: "/client/game/version/validate",
            action: (url, info, sessionID) => {
              try {
                let pmcData = container.resolve("ProfileHelper").getPmcProfile(sessionID);
                let scavData = container.resolve("ProfileHelper").getScavProfile(sessionID);
                if (Config.Player.EnableStats) {
                  pmcData.Health.Energy.Maximum = Config.Player.PMCStats.MaxEnergy;
                  pmcData.Health.Hydration.Maximum = Config.Player.PMCStats.MaxHydration;
                }
                if (Config.Scav.EnableStats) {
                  scavData.Health.Energy.Maximum = Config.Scav.ScavStats.MaxEnergy;
                  scavData.Health.Hydration.Maximum = Config.Scav.ScavStats.MaxHydration;
                }
                if (Config.Player.EnableHealth) {
                  HealthEdit(pmcData, Config.Player.Health.Head, Config.Player.Health.Chest, Config.Player.Health.Stomach, Config.Player.Health.LeftArm, Config.Player.Health.LeftLeg, Config.Player.Health.RightArm, Config.Player.Health.RightLeg, "Maximum");
                }
                if (Config.Scav.EnableScavHealth) {
                  HealthEdit(scavData, Config.Scav.Health.Head, Config.Scav.Health.Chest, Config.Scav.Health.Stomach, Config.Scav.Health.LeftArm, Config.Scav.Health.LeftLeg, Config.Scav.Health.RightArm, Config.Scav.Health.RightLeg, "Current");
                  HealthEdit(scavData, Config.Scav.Health.Head, Config.Scav.Health.Chest, Config.Scav.Health.Stomach, Config.Scav.Health.LeftArm, Config.Scav.Health.LeftLeg, Config.Scav.Health.RightArm, Config.Scav.Health.RightLeg, "Maximum");
                }
                if (Config.Scav.ScavCustomPockets) {
                  scavData.Inventory.items.forEach((item) => {
                    if (item.slotId == "Pockets") {
                      item._tpl = "a8edfb0bce53d103d3f6219b";
                    }
                  })
                }
                return HttpResponse.nullResponse();
              }
              catch (e) {
                Logger.error("[SVM] PMC/SCAV HEALTH/STATS - Didn't manage to apply settings, new profile?\n" + e)
                return HttpResponse.nullResponse();
              }
            }
          }], "spt");
    }
    if (Config.Scav.EnableScavHealth || Config.Scav.ScavCustomPockets) { // TO OVERRIDE NEXT SCAVS HEALTH + POCKETS 
      //May Omnissiah save our souls, have to use both because register affects deaths and resolution affects extracts. Don't ask
      container.afterResolution("ProfileController", (_t, result) => {
        result.generatePlayerScav = (sessionID) => {
          const playerScavGenerator = container.resolve("PlayerScavGenerator");
          const scavData = playerScavGenerator.generate(sessionID);
          if (Config.Scav.EnableStats) {
            scavData.Health.Energy.Maximum = Config.Scav.ScavStats.MaxEnergy;
            scavData.Health.Hydration.Maximum = Config.Scav.ScavStats.MaxHydration;
          }
          HealthEdit(scavData, Config.Scav.Health.Head, Config.Scav.Health.Chest, Config.Scav.Health.Stomach, Config.Scav.Health.LeftArm, Config.Scav.Health.LeftLeg, Config.Scav.Health.RightArm, Config.Scav.Health.RightLeg, "Current");
          HealthEdit(scavData, Config.Scav.Health.Head, Config.Scav.Health.Chest, Config.Scav.Health.Stomach, Config.Scav.Health.LeftArm, Config.Scav.Health.LeftLeg, Config.Scav.Health.RightArm, Config.Scav.Health.RightLeg, "Maximum");
          if (Config.Scav.ScavCustomPockets) {
            scavData.Inventory.items.forEach((item) => {
              if (item.slotId == "Pockets") {
                item._tpl = "a8edfb0bce53d103d3f6219b";
              }
            })
          }
          return scavData;
        }
      }, { frequency: "Always" });

      StaticRouterModService.registerStaticRouter("EditHealthv2",
        [
          {
            url: "/raid/profile/save",
            action: (url, info, sessionID) => {
              if (info.exit !== "survived" && info.exit !== "runner" && info.isPlayerScav) // 3.9.0 If statement for avoiding rerolling survived SCAV, biggest issue of 1.8.3
              {
                const saveServer = container.resolve("SaveServer");
                const playerScavGenerator = container.resolve("PlayerScavGenerator");
                const scavData = playerScavGenerator.generate(sessionID);
                HealthEdit(scavData, Config.Scav.Health.Head, Config.Scav.Health.Chest, Config.Scav.Health.Stomach, Config.Scav.Health.LeftArm, Config.Scav.Health.LeftLeg, Config.Scav.Health.RightArm, Config.Scav.Health.RightLeg, "Current");
                HealthEdit(scavData, Config.Scav.Health.Head, Config.Scav.Health.Chest, Config.Scav.Health.Stomach, Config.Scav.Health.LeftArm, Config.Scav.Health.LeftLeg, Config.Scav.Health.RightArm, Config.Scav.Health.RightLeg, "Maximum");
                if (Config.Scav.ScavCustomPockets) {
                  scavData.Inventory.items.forEach((item) => {
                    if (item.slotId == "Pockets") {
                      item._tpl = "a8edfb0bce53d103d3f6219b";
                    }
                  })
                }
                saveServer.getProfile(sessionID).characters.scav = scavData;
              }
              return HttpResponse.nullResponse();
            }
          }], "spt");
    }
    function HealthEdit(Data, Head, Chest, Stomach, LeftArm, LeftLeg, RightArm, RightLeg, CurMax) {
      try {
        Data.Health.BodyParts["Head"].Health[CurMax] = Head
        Data.Health.BodyParts["Chest"].Health[CurMax] = Chest
        Data.Health.BodyParts["Stomach"].Health[CurMax] = Stomach
        Data.Health.BodyParts["LeftArm"].Health[CurMax] = LeftArm
        Data.Health.BodyParts["LeftLeg"].Health[CurMax] = LeftLeg
        Data.Health.BodyParts["RightArm"].Health[CurMax] = RightArm
        Data.Health.BodyParts["RightLeg"].Health[CurMax] = RightLeg
      }
      catch {
        Logger.error("[SVM] HEALTH EDIT - Something went wrong with trying to generate custom maximum health, new profile? \n" + e)
      }
    }
  }
  postDBLoad(container) {
    const PreDBStart = performance.now();
    const Logger = container.resolve("WinstonLogger");
    try {//This is dumb piece of code is a handler so PostDB won't run after PreDB did throw a message that something ain't right with the loader.
      const PresetLoader = require('../Loader/loader.json');
      const Config = require('../Presets/' + PresetLoader.CurrentlySelectedPreset + '.json');
    }
    catch (e) {
      return
    }
    //Config variables to asset for funcs.
    const PresetLoader = require('../Loader/loader.json');
    const Config = require('../Presets/' + PresetLoader.CurrentlySelectedPreset + '.json');
    const Arrays = require('../src/Arrays.json');
    //DB redirects
    const DB = container.resolve("DatabaseService").getTables();
    const hideout = DB.hideout;
    const locations = DB.locations;
    const traders = DB.traders;
    const Quests = DB.templates.quests;
    const suits = DB.templates.customization;
    const items = DB.templates.items;
    const globals = DB.globals.config;
    const Bot = DB.bots.types
    // Redirects to server internal configs.
    const configServer = container.resolve("ConfigServer");
    const Inraid = configServer.getConfig("spt-inraid");
    const Repair = configServer.getConfig("spt-repair");
    const locs = configServer.getConfig("spt-location");
    const Airdrop = configServer.getConfig("spt-airdrop");
    const Ragfair = configServer.getConfig("spt-ragfair");
    const Insurance = configServer.getConfig("spt-insurance");
    const Health = configServer.getConfig("spt-health");
    const Bots = configServer.getConfig("spt-bot");
    const Quest = configServer.getConfig("spt-quest");
    const WeatherValues = configServer.getConfig("spt-weather");
    const trader = configServer.getConfig("spt-trader");
    const Events = configServer.getConfig("spt-seasonalevents");
    //const Inventory = configServer.getConfig("aki-inventory");
    const BlackItems = configServer.getConfig("spt-item");
    const PMC = configServer.getConfig("spt-pmc")
    //############## FLEAMARKET SECTION ###########
    if (Config.Fleamarket.EnableFleamarket) {
      if (Config.Fleamarket.EnablePlayerOffers) {
        globals.RagFair.minUserLevel = Config.Fleamarket.FleaMarketLevel;
        Ragfair.dynamic.purchasesAreFoundInRaid = Config.Fleamarket.FleaFIR;
        globals.RagFair.isOnlyFoundInRaidAllowed = Config.Fleamarket.FleaNoFIRSell;
        Ragfair.dynamic.blacklist.enableBsgList = !Config.Fleamarket.DisableBSGList;
        Ragfair.sell.fees = Config.Fleamarket.EnableFees;
        Ragfair.sell.chance.base = Config.Fleamarket.Sell_chance;
        Ragfair.sell.chance.sellMultiplier = Config.Fleamarket.Sell_mult;
        Ragfair.sell.time.max = Config.Fleamarket.Tradeoffer_max;
        Ragfair.sell.time.min = Config.Fleamarket.Tradeoffer_min;
        globals.RagFair.ratingIncreaseCount = Config.Fleamarket.Rep_gain;
        globals.RagFair.ratingDecreaseCount = Config.Fleamarket.Rep_loss;

        if (Config.Fleamarket.OverrideOffers) {
          const offer = {
            "from": -100000,
            "to": 100000,
            "count": Config.Fleamarket.SellOffersAmount
          }
          globals.RagFair.maxActiveOfferCount = []
          globals.RagFair.maxActiveOfferCount.push(offer)
        }
      }
      //Bundle Chance
      Ragfair.dynamic.pack.chancePercent = Config.Fleamarket.DynamicOffers.BundleOfferChance;
      //Dynamic offers
      Ragfair.dynamic.expiredOfferThreshold = Config.Fleamarket.DynamicOffers.ExpireThreshold;
      //Min-Max
      Ragfair.dynamic.offerItemCount.min = Config.Fleamarket.DynamicOffers.PerOffer_min;
      Ragfair.dynamic.offerItemCount.max = Config.Fleamarket.DynamicOffers.PerOffer_max;
      //Unifying the multiplier, not the best case scenario, but it is rather simple to comprehend and modify for common user, they'll never know >_>
      Ragfair.dynamic.priceRanges.default.min = Config.Fleamarket.DynamicOffers.Price_min;
      Ragfair.dynamic.priceRanges.default.max = Config.Fleamarket.DynamicOffers.Price_max;
      Ragfair.dynamic.priceRanges.pack.min = Config.Fleamarket.DynamicOffers.Price_min;
      Ragfair.dynamic.priceRanges.pack.max = Config.Fleamarket.DynamicOffers.Price_max;
      Ragfair.dynamic.priceRanges.preset.min = Config.Fleamarket.DynamicOffers.Price_min;
      Ragfair.dynamic.priceRanges.preset.max = Config.Fleamarket.DynamicOffers.Price_max;
      Ragfair.dynamic.endTimeSeconds.min = Config.Fleamarket.DynamicOffers.Time_min * 60;
      Ragfair.dynamic.endTimeSeconds.max = Config.Fleamarket.DynamicOffers.Time_max * 60;
      Ragfair.dynamic.nonStackableCount.min = Config.Fleamarket.DynamicOffers.NonStack_min;
      Ragfair.dynamic.nonStackableCount.max = Config.Fleamarket.DynamicOffers.NonStack_max;
      Ragfair.dynamic.stackablePercent.min = Config.Fleamarket.DynamicOffers.Stack_min;
      Ragfair.dynamic.stackablePercent.max = Config.Fleamarket.DynamicOffers.Stack_max;
      //Currencies
      Ragfair.dynamic.currencies["5449016a4bdc2d6f028b456f"] = Config.Fleamarket.DynamicOffers.Roubleoffers;
      Ragfair.dynamic.currencies["5696686a4bdc2da3298b456a"] = Config.Fleamarket.DynamicOffers.Dollaroffers;
      Ragfair.dynamic.currencies["569668774bdc2da2298b4568"] = Config.Fleamarket.DynamicOffers.Eurooffers;
      //Wear condition in offers
      if (Config.Fleamarket.EnableFleaConditions)
        Ragfair.dynamic.condition["5422acb9af1c889c16000029"].max.min = parseFloat((Config.Fleamarket.FleaConditions.FleaWeapons_Min / 100).toFixed(2))
      Ragfair.dynamic.condition["543be5664bdc2dd4348b4569"].max.min = parseFloat((Config.Fleamarket.FleaConditions.FleaMedical_Min / 100).toFixed(2))
      Ragfair.dynamic.condition["5447e0e74bdc2d3c308b4567"].max.min = parseFloat((Config.Fleamarket.FleaConditions.FleaSpec_Min / 100).toFixed(2))
      Ragfair.dynamic.condition["543be5e94bdc2df1348b4568"].max.min = parseFloat((Config.Fleamarket.FleaConditions.FleaKeys_Min / 100).toFixed(2))
      Ragfair.dynamic.condition["5448e5284bdc2dcb718b4567"].max.min = parseFloat((Config.Fleamarket.FleaConditions.FleaVests_Min / 100).toFixed(2))
      Ragfair.dynamic.condition["57bef4c42459772e8d35a53b"].max.min = parseFloat((Config.Fleamarket.FleaConditions.FleaArmor_Min / 100).toFixed(2))
      Ragfair.dynamic.condition["543be6674bdc2df1348b4569"].max.min = parseFloat((Config.Fleamarket.FleaConditions.FleaFood_Min / 100).toFixed(2))
      Ragfair.dynamic.condition["5422acb9af1c889c16000029"].max.max = parseFloat((Config.Fleamarket.FleaConditions.FleaWeapons_Max / 100).toFixed(2))
      Ragfair.dynamic.condition["543be5664bdc2dd4348b4569"].max.max = parseFloat((Config.Fleamarket.FleaConditions.FleaMedical_Max / 100).toFixed(2))
      Ragfair.dynamic.condition["5447e0e74bdc2d3c308b4567"].max.max = parseFloat((Config.Fleamarket.FleaConditions.FleaSpec_Max / 100).toFixed(2))
      Ragfair.dynamic.condition["543be5e94bdc2df1348b4568"].max.max = parseFloat((Config.Fleamarket.FleaConditions.FleaKeys_Max / 100).toFixed(2))
      Ragfair.dynamic.condition["5448e5284bdc2dcb718b4567"].max.max = parseFloat((Config.Fleamarket.FleaConditions.FleaVests_Max / 100).toFixed(2))
      Ragfair.dynamic.condition["57bef4c42459772e8d35a53b"].max.max = parseFloat((Config.Fleamarket.FleaConditions.FleaArmor_Max / 100).toFixed(2))
      Ragfair.dynamic.condition["543be6674bdc2df1348b4569"].max.max = parseFloat((Config.Fleamarket.FleaConditions.FleaFood_Max / 100).toFixed(2))
    }
    //############## LOOT SECTION #################
    if (Config.Loot.EnableLoot) {
      //loose loot mults
      locs.looseLootMultiplier.bigmap = Config.Loot.Locations.Streets.Loose;
      locs.looseLootMultiplier.factory4_day = Config.Loot.Locations.FactoryDay.Loose;
      locs.looseLootMultiplier.factory4_night = Config.Loot.Locations.FactoryNight.Loose;
      locs.looseLootMultiplier.interchange = Config.Loot.Locations.Interchange.Loose;
      locs.looseLootMultiplier.laboratory = Config.Loot.Locations.Laboratory.Loose;
      locs.looseLootMultiplier.rezervbase = Config.Loot.Locations.Reserve.Loose;
      locs.looseLootMultiplier.shoreline = Config.Loot.Locations.Shoreline.Loose;
      locs.looseLootMultiplier.woods = Config.Loot.Locations.Woods.Loose;
      locs.looseLootMultiplier.lighthouse = Config.Loot.Locations.Lighthouse.Loose;
      locs.looseLootMultiplier.tarkovstreets = Config.Loot.Locations.Streets.Loose;
      locs.looseLootMultiplier.sandbox = Config.Loot.Locations.Sandbox.Loose;
      locs.looseLootMultiplier.sandbox_high = Config.Loot.Locations.SandboxHard.Loose;
      //container loot mults
      locs.staticLootMultiplier.bigmap = Config.Loot.Locations.Bigmap.Container;
      locs.staticLootMultiplier.factory4_day = Config.Loot.Locations.FactoryDay.Container;
      locs.staticLootMultiplier.factory4_night = Config.Loot.Locations.FactoryNight.Container;
      locs.staticLootMultiplier.interchange = Config.Loot.Locations.Interchange.Container;
      locs.staticLootMultiplier.laboratory = Config.Loot.Locations.Laboratory.Container;
      locs.staticLootMultiplier.rezervbase = Config.Loot.Locations.Reserve.Container;
      locs.staticLootMultiplier.shoreline = Config.Loot.Locations.Shoreline.Container;
      locs.staticLootMultiplier.woods = Config.Loot.Locations.Woods.Container;
      locs.staticLootMultiplier.lighthouse = Config.Loot.Locations.Lighthouse.Container;
      locs.staticLootMultiplier.tarkovstreets = Config.Loot.Locations.Streets.Container;
      locs.staticLootMultiplier.sandbox = Config.Loot.Locations.Sandbox.Container;
      locs.staticLootMultiplier.sandbox_high = Config.Loot.Locations.SandboxHard.Container;
      locs.containerRandomisationSettings.enabled = !Config.Loot.Locations.AllContainers
      //############## AIRDROPS SECTION ##################
      locations["bigmap"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Bigmap_air / 100).toFixed(2));
      locations["shoreline"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Shoreline_air / 100).toFixed(2));
      locations["rezervbase"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Reserve_air / 100).toFixed(2));
      locations["lighthouse"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Lighthouse_air / 100).toFixed(2));
      locations["interchange"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Interchange_air / 100).toFixed(2));
      locations["tarkovstreets"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Streets_air / 100).toFixed(2));
      locations["sandbox"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Sandbox_air / 100).toFixed(2));
      locations["sandbox_high"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Sandbox_air / 100).toFixed(2));
      locations["woods"].base.AirdropParameters[0].PlaneAirdropChance = parseFloat((Config.Loot.Airdrops.Woods_air / 100).toFixed(2));
      for (let timers in locations) {
        if (timers != "develop" && timers != "base" && timers != "privatearea" && timers != "terminal" && timers != "factory4_day" && timers != "hideout" && timers != "laboratory" && timers != "factory4_night" && timers != "town" && timers != "suburbs") {// 3.10 need to rework.
          locations[timers].base.AirdropParameters[0].PlaneAirdropStartMin = Config.Loot.Airdrops.AirtimeMin * 60;
          locations[timers].base.AirdropParameters[0].PlaneAirdropStartMax = Config.Loot.Airdrops.AirtimeMax * 60;
        }
      }
      let Mixed = Config.Loot.Airdrops.Mixed
      let Weapon = Config.Loot.Airdrops.Weapon
      let Barter = Config.Loot.Airdrops.Barter
      let Medical = Config.Loot.Airdrops.Medical
      AirdropContents("mixed", Mixed)
      AirdropContents("weaponArmor", Weapon)
      AirdropContents("barter", Barter)
      AirdropContents("foodMedical", Medical)
    }
    //############## BOTS SECTION #################
    if (Config.Bots.EnableBots) {
      for (let i in locations) {
        if (i !== "base" && locations[i].base.BossLocationSpawn) {
          for (let x in locations[i].base.BossLocationSpawn) {
            switch (locations[i].base.BossLocationSpawn[x].BossName) {
              case "bossBoar":
                locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Kaban
                break;
              case "bossKolontay":
                if (i == "sandbox_high") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.KolontayGZ
                }
                if (i == "tarkovstreets") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.KolontayStreets
                }
                break;
              case "bossPartisan":
                // if (i == "bigmap") { Controlled by trigger, ignored for now.
                //  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.PartisanCustoms
                // }
                if (i == "shoreline") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.PartisanShoreline
                }
                if (i == "lighthouse") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.PartisanLighthouse
                }
                if (i == "woods") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.PartisanWoods
                }
                break;
              case "bossBully":
                locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Reshala
                break;
              case "bossSanitar":
                locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Sanitar
                break;
              case "bossKilla":
                if (i == "interchange") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Killa
                }
                break;
              case "bossTagilla":
                if (i == "factory4_day") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Tagilla
                }
                if (i == "factory4_night") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.TagillaNight
                }
                break;
              case "bossGluhar":
                locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Glukhar
                break;
              case "bossKojaniy":
                locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Shturman
                break;
              case "bossZryachiy":
                locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Zryachiy
                break;
              case "exUsec":
                locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Rogue
                break;
              case "bossKnight":
                if (i == "woods") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.TrioWoods
                }
                if (i == "shoreline") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.TrioShoreline
                }
                if (i == "bigmap") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.Trio
                }
                if (i == "lighthouse") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.TrioLighthouse
                }
                break;
              case "pmcBot":
                if (i == "laboratory") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.RaiderLab
                }
                if (i == "rezervbase") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.RaiderReserve
                }
                break;
              case "sectantPriest":
                if (i == "factory4_night") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.CultistFactory
                }
                if (i == "woods") {

                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.CultistWoods
                }
                if (i == "bigmap") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.CultistCustoms
                }
                if (i == "shoreline") {
                  locations[i].base.BossLocationSpawn[x].BossChance = Config.Bots.AIChance.CultistShoreline
                }
                break;
            }
          }
        }
      }
      const WepDur = Config.Bots.WeaponDurab;
      const ArmorDur = Config.Bots.ArmorDurab;
      const BotWepMinID = [WepDur.ScavMin, WepDur.MarksmanMin, WepDur.RaiderMin, WepDur.RogueMin, WepDur.PMCMin, WepDur.BossMin, WepDur.FollowerMin];
      const BotWepMaxID = [WepDur.ScavMax, WepDur.MarksmanMax, WepDur.RaiderMax, WepDur.RogueMax, WepDur.PMCMax, WepDur.BossMax, WepDur.FollowerMax];
      const BotArmorMinID = [ArmorDur.ScavMin, ArmorDur.MarksmanMin, ArmorDur.RaiderMin, ArmorDur.RogueMin, ArmorDur.PMCMin, ArmorDur.BossMin, ArmorDur.FollowerMin];
      const BotArmorMaxID = [ArmorDur.ScavMax, ArmorDur.MarksmanMax, ArmorDur.RaiderMax, ArmorDur.RogueMax, ArmorDur.PMCMax, ArmorDur.BossMax, ArmorDur.FollowerMax];

      const BotTypeID = ["assault", "marksman", "pmcbot", "exusec", "pmc", "boss", "follower"]
      for (let durab in BotTypeID) {
        Bots.durability[BotTypeID[durab]].weapon.lowestMax = BotWepMinID[durab];
        Bots.durability[BotTypeID[durab]].weapon.highestMax = BotWepMaxID[durab];
        Bots.durability[BotTypeID[durab]].armor.maxDelta = 100 - BotArmorMinID[durab];
        Bots.durability[BotTypeID[durab]].armor.minDelta = 100 - BotArmorMaxID[durab];
        switch (BotTypeID[durab]) {
          case "assault":
            Bots.durability["cursedassault"].weapon.lowestMax = BotWepMinID[durab]
            Bots.durability["cursedassault"].weapon.highestMax = BotWepMaxID[durab]
            Bots.durability["cursedassault"].armor.maxDelta = 100 - BotArmorMinID[durab];
            Bots.durability["cursedassault"].armor.minDelta = 100 - BotArmorMaxID[durab];

            Bots.durability["crazyassaultevent"].weapon.lowestMax = BotWepMinID[durab]
            Bots.durability["crazyassaultevent"].weapon.highestMax = BotWepMaxID[durab]
            Bots.durability["crazyassaultevent"].armor.maxDelta = 100 - BotArmorMinID[durab];
            Bots.durability["crazyassaultevent"].armor.minDelta = 100 - BotArmorMaxID[durab];
            break;
          case "pmcbot":
            Bots.durability["arenafighterevent"].weapon.lowestMax = BotWepMinID[durab]
            Bots.durability["arenafighterevent"].weapon.highestMax = BotWepMaxID[durab]
            Bots.durability["arenafighterevent"].armor.maxDelta = 100 - BotArmorMinID[durab];
            Bots.durability["arenafighterevent"].armor.minDelta = 100 - BotArmorMaxID[durab];
            break
          case "boss":
            Bots.durability["sectantpriest"].weapon.lowestMax = BotWepMinID[durab];
            Bots.durability["sectantpriest"].weapon.highestMax = BotWepMaxID[durab];
            Bots.durability["sectantpriest"].armor.maxDelta = 100 - BotArmorMinID[durab];
            Bots.durability["sectantpriest"].armor.minDelta = 100 - BotArmorMaxID[durab];
            break;
          case "follower":
            Bots.durability["sectantwarrior"].weapon.lowestMax = BotWepMinID[durab];
            Bots.durability["sectantwarrior"].weapon.highestMax = BotWepMaxID[durab];
            Bots.durability["sectantwarrior"].armor.maxDelta = 100 - BotArmorMinID[durab];
            Bots.durability["sectantwarrior"].armor.minDelta = 100 - BotArmorMaxID[durab];
            break;
        }
      }
    }
    //############## INSURANCE/REPAIR SECTION ############
    if (Config.Services.EnableServices) {
      //Repair.priceMultiplier = Config.Insurance.RepairBox.RepairMult; Disabled due to visual bug - it doesn't show converted number, the function itself is working tho
      Repair.armorKitSkillPointGainPerRepairPointMultiplier = Config.Services.RepairBox.ArmorSkillMult;
      Repair.weaponTreatment.pointGainMultiplier = Config.Services.RepairBox.WeaponMaintenanceSkillMult;
      Repair.repairKitIntellectGainMultiplier.weapon = Config.Services.RepairBox.IntellectSkillMultWeaponKit;
      Repair.repairKitIntellectGainMultiplier.armor = Config.Services.RepairBox.IntellectSkillMultArmorKit;
      Repair.maxIntellectGainPerRepair.kit = Config.Services.RepairBox.IntellectSkillLimitKit;
      Repair.maxIntellectGainPerRepair.trader = Config.Services.RepairBox.IntellectSkillLimitTraders;
      Repair.applyRandomizeDurabilityLoss = !Config.Services.RepairBox.NoRandomRepair;
      if (Config.Services.EnableInsurance) {
        Insurance.returnChancePercent["54cb50c76803fa8b248b4571"] = Config.Services.ReturnChancePrapor;
        Insurance.returnChancePercent["54cb57776803fa99248b456e"] = Config.Services.ReturnChanceTherapist;
        traders["54cb50c76803fa8b248b4571"].base.insurance.max_storage_time = Config.Services.PraporStorageTime;
        traders["54cb57776803fa99248b456e"].base.insurance.max_storage_time = Config.Services.TherapistStorageTime;
        traders["54cb50c76803fa8b248b4571"].base.insurance.min_return_hour = Config.Services.Prapor_Min;
        traders["54cb50c76803fa8b248b4571"].base.insurance.max_return_hour = Config.Services.Prapor_Max;
        traders["54cb57776803fa99248b456e"].base.insurance.min_return_hour = Config.Services.Therapist_Min;
        traders["54cb57776803fa99248b456e"].base.insurance.max_return_hour = Config.Services.Therapist_Max;
        Insurance.chanceNoAttachmentsTakenPercent = Config.Services.InsuranceAttachmentChance
        //3.9.0 insurance fix + new fields
        Insurance.runIntervalSeconds = Config.Services.InsuranceInterval
        if (Config.Services.EnableTimeOverride) {
          Insurance.returnTimeOverrideSeconds = Config.Services.InsuranceTimeOverride
        }
        let TherapistMult = [Config.Services.InsuranceMultTherapistLvl1, Config.Services.InsuranceMultTherapistLvl2, Config.Services.InsuranceMultTherapistLvl3, Config.Services.InsuranceMultTherapistLvl4]
        for (let level in traders["54cb57776803fa99248b456e"].base.loyaltyLevels) {
          traders["54cb57776803fa99248b456e"].base.loyaltyLevels[level].insurance_price_coef = TherapistMult[level]
        }
        let PraporMult = [Config.Services.InsuranceMultPraporLvl1, Config.Services.InsuranceMultPraporLvl2, Config.Services.InsuranceMultPraporLvl3, Config.Services.InsuranceMultPraporLvl4]
        for (let level in traders["54cb50c76803fa8b248b4571"].base.loyaltyLevels) {
          traders["54cb50c76803fa8b248b4571"].base.loyaltyLevels[level].insurance_price_coef = PraporMult[level]
        }
      }
      //Enable all clothes available for both side
      if (Config.Services.ClothesAnySide) {
        for (let suit in suits) {
          let suitData = suits[suit]
          if (suitData._parent === "5cd944ca1388ce03a44dc2a4" || suitData._parent === "5cd944d01388ce000a659df9") {
            suitData._props.Side = ["Bear", "Usec"];
          }
        }
      }
      if (Config.Services.ClothesFree || Config.Services.ClothesLevelUnlock) {
        for (let tradercloth in traders) {
          if (traders[tradercloth].suits) {
            for (let file in traders[tradercloth].suits) {
              let fileData = traders[tradercloth].suits[file]
              if (Config.Services.ClothesLevelUnlock) {
                fileData.requirements.loyaltyLevel = 1;
                fileData.requirements.profileLevel = 1;
                fileData.requirements.standing = 0;
                fileData.requirements.questRequirements = [];//Only adik hits this
              }
              //fileData.requirements.skillRequirements = [];//This is useless, it always stands for empty
              if (Config.Services.ClothesFree) {
                fileData.requirements.itemRequirements = [];
              }
            }
          }
        }
      }
      if (Config.Services.EnableHealMarkup) {
        let TherapistLevels = [Config.Services.TherapistLvl1, Config.Services.TherapistLvl2, Config.Services.TherapistLvl3, Config.Services.TherapistLvl4]
        for (let level in traders["54cb57776803fa99248b456e"].base.loyaltyLevels) {
          traders["54cb57776803fa99248b456e"].base.loyaltyLevels[level].heal_price_coef = TherapistLevels[level] * 100
        }
        globals.Health.HealPrice.TrialLevels = Config.Services.FreeHealLvl
        globals.Health.HealPrice.TrialRaids = Config.Services.FreeHealRaids
      }
      if (Config.Services.EnableRepair) {
        for (let CurTrader in traders) {
          if (CurTrader !== "ragfair" && (CurTrader == "5a7c2eca46aef81a7ca2145d" || CurTrader == "5ac3b934156ae10c4430e83c" || CurTrader == "5c0647fdd443bc2504c2d371" || CurTrader == "54cb50c76803fa8b248b4571" || CurTrader == "54cb57776803fa99248b456e" || CurTrader == "579dc571d53a0658a154fbec" || CurTrader == "5935c25fb3acc3127c3d8cd9" || CurTrader == "58330581ace78e27b8b10cee")) {
            for (let level in traders[CurTrader].base.loyaltyLevels) {
              traders[CurTrader].base.loyaltyLevels[level].repair_price_coef *= Config.Services.RepairBox.RepairMult;
            }
          }
        }
        if (Config.Services.RepairBox.OpArmorRepair) {
          for (let armormats in globals.ArmorMaterials) {
            globals.ArmorMaterials[armormats].MaxRepairDegradation = 0
            globals.ArmorMaterials[armormats].MinRepairDegradation = 0
            globals.ArmorMaterials[armormats].MaxRepairKitDegradation = 0
            globals.ArmorMaterials[armormats].MinRepairKitDegradation = 0
          }
        }
        if (Config.Services.RepairBox.OpGunRepair) {
          for (let stuff in items) {
            if (items[stuff]._props.MaxRepairDegradation !== undefined && items[stuff]._props.MaxRepairKitDegradation !== undefined) {
              EditSimpleItemData(stuff, "MinRepairDegradation", 0);
              EditSimpleItemData(stuff, "MaxRepairDegradation", 0);
              EditSimpleItemData(stuff, "MinRepairKitDegradation", 0);
              EditSimpleItemData(stuff, "MaxRepairKitDegradation", 0);
            }
          }
        }
      }
    }
    //############## CSM SECTION ##################
    if (Config.CSM.EnableCSM) {
      if (Config.CSM.CustomPocket) {
        const JsonUtil = container.resolve("JsonUtil");
        let CustomPocketItem = JsonUtil.clone(items["627a4e6b255f7527fb05a0f6"])
        let PocketSize = Config.CSM.Pockets
        CustomPocketItem._id = "a8edfb0bce53d103d3f62b9b";
        for (let cell in CustomPocketItem._props.Grids)//tried to make less code, made more, smh.
        {
          CustomPocketItem._props.Grids[cell]._parent = "a8edfb0bce53d103d3f62b9b"
        }
        for (let cell in CustomPocketItem._props.Slots) {
          CustomPocketItem._props.Slots[cell]._parent = "a8edfb0bce53d103d3f62b9b"
        }
        CustomPocketItem._props.Grids[0]._id = "a8edfb0bce53d103d3f62b0b"
        CustomPocketItem._props.Grids[0]._props.cellsH = PocketSize.FirstWidth
        CustomPocketItem._props.Grids[0]._props.cellsV = PocketSize.FirstHeight
        CustomPocketItem._props.Grids[1]._id = "a8edfb0bce53d103d3f62b1b"
        CustomPocketItem._props.Grids[1]._props.cellsH = PocketSize.SecondWidth
        CustomPocketItem._props.Grids[1]._props.cellsV = PocketSize.SecondHeight
        CustomPocketItem._props.Grids[2]._id = "a8edfb0bce53d103d3f62b2b"
        CustomPocketItem._props.Grids[2]._props.cellsH = PocketSize.ThirdWidth
        CustomPocketItem._props.Grids[2]._props.cellsV = PocketSize.ThirdHeight
        CustomPocketItem._props.Grids[3]._id = "a8edfb0bce53d103d3f62b3b"
        CustomPocketItem._props.Grids[3]._props.cellsH = PocketSize.FourthWidth
        CustomPocketItem._props.Grids[3]._props.cellsV = PocketSize.FourthHeight
        CustomPocketItem._props.Slots[0]._id = "a8edfb0bce53d103d3f62b4b"
        CustomPocketItem._props.Slots[1]._id = "a8edfb0bce53d103d3f62b5b"
        CustomPocketItem._props.Slots[2]._id = "a8edfb0bce53d103d3f62b6b"
        if (PocketSize.FourthWidth == 0 || PocketSize.FourthHeight == 0) {
          CustomPocketItem._props.Grids.splice(3, 1);
        }
        if (PocketSize.ThirdWidth == 0 || PocketSize.ThirdHeight == 0) {
          CustomPocketItem._props.Grids.splice(2, 1);
        }
        if (PocketSize.SecondWidth == 0 || PocketSize.SecondHeight == 0) {
          CustomPocketItem._props.Grids.splice(1, 1);
        }
        if (PocketSize.FirstWidth == 0 || PocketSize.FirstHeight == 0) {
          CustomPocketItem._props.Grids.splice(0, 1);
        }

        switch (true) {
          case Config.CSM.Pockets.SpecSlots == 0:
            CustomPocketItem._props.Slots.splice(0, 3);
            break;
          case Config.CSM.Pockets.SpecSlots == 1:
            CustomPocketItem._props.Slots.splice(1, 2);
            break;
          case Config.CSM.Pockets.SpecSlots == 2:
            CustomPocketItem._props.Slots.splice(2, 1);
            break;
          case Config.CSM.Pockets.SpecSlots == 3:
            break;
          case Config.CSM.Pockets.SpecSlots >= 4://Graduality done, switched `switch` to true statement and expressions.
            CustomPocketItem._props.Slots[3] = JsonUtil.clone(CustomPocketItem._props.Slots[2])
            CustomPocketItem._props.Slots[3]._id = "a8edfb0bce53d103d3f62b7b"
            CustomPocketItem._props.Slots[3]._name = "SpecialSlot4"
            CustomPocketItem._props.Slots[3]._parent = "a8edfb0bce53d103d3f62b9b"
            Insurance.blacklistedEquipment.push("SpecialSlot4")
          case Config.CSM.Pockets.SpecSlots == 5:
            CustomPocketItem._props.Slots[4] = JsonUtil.clone(CustomPocketItem._props.Slots[2])
            CustomPocketItem._props.Slots[4]._id = "a8edfb0bce53d103d3f62b8b"
            CustomPocketItem._props.Slots[4]._name = "SpecialSlot5"
            CustomPocketItem._props.Slots[4]._parent = "a8edfb0bce53d103d3f62b9b"
            Insurance.blacklistedEquipment.push("SpecialSlot5")
            break;
        }
        //This is a solution to avoid removing cases from bodies if they die.
        let IDsToFilter = ["5783c43d2459774bbe137486", "60b0f6c058e0b0481a09ad11", "619cbf9e0a7c3a1a2731940a", "619cbf7d23893217ec30b689", "59fafd4b86f7745ca07e1232", "62a09d3bcf4a99369e262447"];
        let Pockets = Config.CSM.Pockets
        let CasesToFilter = [Pockets.SpecSimpleWallet, Pockets.SpecWZWallet, Pockets.SpecKeycardHolder, Pockets.SpecInjectorCase, Pockets.SpecKeytool, Pockets.SpecGKeychain];
        for (let ID in IDsToFilter) {
          items[IDsToFilter[ID]]._props.DiscardLimit = -1;
          items[IDsToFilter[ID]]._props.InsuranceDisabled = true;
        }
        for (let specialslots in CustomPocketItem._props.Slots) {
          for (let element in IDsToFilter) {
            if (CasesToFilter[element]) {
              CustomPocketItem._props.Slots[specialslots]._props.filters[0].Filter.push(IDsToFilter[element])
            }
          }
          //items[IDsToFilter[specialslots]]._props.HideEntrails = true;
        }
        items["a8edfb0bce53d103d3f62b9b"] = CustomPocketItem;
        //items["5795f317245977243854e041"]._props.HideEntrails = true; Still unsure what does it do
      }
      if (Config.CSM.EnableSecureCases) {
        const SecCon = Config.CSM.SecureContainers

        const SecHeight = [
          SecCon.AlphaHeight,
          SecCon.KappaHeight,
          SecCon.BetaHeight,
          SecCon.EpsilonHeight,
          SecCon.GammaHeight,
          SecCon.GammaTUEHeight,
          SecCon.WaistPouchHeight,
          SecCon.DevHeight
        ];
        const SecWidth = [
          SecCon.AlphaWidth,
          SecCon.KappaWidth,
          SecCon.BetaWidth,
          SecCon.EpsilonWidth,
          SecCon.GammaWidth,
          SecCon.GammaTUEWidth,
          SecCon.WaistPouchWidth,
          SecCon.DevWidth
        ];
        for (let SecConts in Arrays.SecConID) {
          items[Arrays.SecConID[SecConts]]._props.Grids[0]._props["cellsV"] = SecHeight[SecConts];
          items[Arrays.SecConID[SecConts]]._props.Grids[0]._props["cellsH"] = SecWidth[SecConts];
        }
      }
      if (Config.CSM.EnableCases) {
        const Cases = Config.CSM.Cases
        const Size = [
          Cases.MoneyCase,
          Cases.SimpleWallet,
          Cases.WZWallet,
          Cases.GrenadeCase,
          Cases.ItemsCase,
          Cases.WeaponCase,
          Cases.LuckyScav,
          Cases.AmmunitionCase,
          Cases.MagazineCase,
          Cases.DogtagCase,
          Cases.MedicineCase,
          Cases.ThiccItemsCase,
          Cases.ThiccWeaponCase,
          Cases.SiccCase,
          Cases.Keytool,
          Cases.DocumentsCase,
          Cases.PistolCase,
          Cases.Holodilnick,
          Cases.InjectorCase,
          Cases.KeycardHolderCase,
          Cases.GKeychain
        ]
        const Filts = [
          Cases.MoneyCase.Filter,
          Cases.SimpleWallet.Filter,
          Cases.WZWallet.Filter,
          Cases.GrenadeCase.Filter,
          Cases.ItemsCase.Filter,
          Cases.WeaponCase.Filter,
          Cases.LuckyScav.Filter,
          Cases.AmmunitionCase.Filter,
          Cases.MagazineCase.Filter,
          Cases.DogtagCase.Filter,
          Cases.MedicineCase.Filter,
          Cases.ThiccItemsCase.Filter,
          Cases.ThiccWeaponCase.Filter,
          Cases.SiccCase.Filter,
          Cases.Keytool.Filter,
          Cases.DocumentsCase.Filter,
          Cases.PistolCase.Filter,
          Cases.Holodilnick.Filter,
          Cases.InjectorCase.Filter,
          Cases.KeycardHolderCase.Filter,
          Cases.GKeychain.Filter
        ]
        for (let Case in Arrays.CasesID) {
          items[Arrays.CasesID[Case]]._props.Grids[0]._props["cellsV"] = Size[Case].Height;
          items[Arrays.CasesID[Case]]._props.Grids[0]._props["cellsH"] = Size[Case].Width;
        }
        //Filters
        for (let Filters in Filts) {
          if (Filts[Filters]) // To check whether checkmark is true or false
          {
            items[Arrays.CasesID[Filters]]._props.Grids[0]._props.filters = [];
          }
        }
      }
    }
    //############## ITEMS SECTION ################
    if (Config.Items.EnableItems) {

      //Price Modifier
      for (const item in DB.templates.handbook.Items) {
        if (DB.templates.handbook.Items[item].ParentId !== "5b5f78b786f77447ed5636af" && DB.templates.handbook.Items[item].Price != null) {
          DB.templates.handbook.Items[item].Price = (DB.templates.handbook.Items[item].Price * Config.Items.ItemPriceMult)
        }
      }
      //Loading-Unloading rounds in a magazine
      globals.BaseUnloadTime = globals.BaseUnloadTime * Config.Items.AmmoLoadSpeed;
      globals.BaseLoadTime = globals.BaseLoadTime * Config.Items.AmmoLoadSpeed;
      //Signal Pistol into Special slots
      if (Config.Items.AddSignalPistolToSpec) {
        if (items["a8edfb0bce53d103d3f62b9b"] !== undefined) {
          for (let specialslots in items["a8edfb0bce53d103d3f62b9b"]._props.Slots) {
            items["a8edfb0bce53d103d3f62b9b"]._props.Slots[specialslots]._props.filters[0].Filter.push("620109578d82e67e7911abf2")
          }
        }
        if (items["627a4e6b255f7527fb05a0f6"] !== undefined) {
          for (let specialslots in items["627a4e6b255f7527fb05a0f6"]._props.Slots) {
            items["627a4e6b255f7527fb05a0f6"]._props.Slots[specialslots]._props.filters[0].Filter.push("620109578d82e67e7911abf2")
          }
        }
        if (items["65e080be269cbd5c5005e529"] !== undefined) {
          for (let specialslots in items["65e080be269cbd5c5005e529"]._props.Slots) {
            items["65e080be269cbd5c5005e529"]._props.Slots[specialslots]._props.filters[0].Filter.push("620109578d82e67e7911abf2")
          }
        }
      }
      for (const id in items) {
        let base = items[id]
        //Examining time
        if (base._type == "Item" && base._props.ExamineTime !== undefined) {
          EditSimpleItemData(id, "ExamineTime", Config.Items.ExamineTime);
        }
        //Fragmentation Multiplier
        if (base._props.FragmentationChance !== undefined) {
          EditSimpleItemData(id, "FragmentationChance", parseFloat(base._props.FragmentationChance * Config.Items.FragmentMult).toFixed(2));
        }
        //Heat Factor Multiplier
        if (base._props.HeatFactor !== undefined) {
          EditSimpleItemData(id, "HeatFactor", parseFloat(base._props.HeatFactor * Config.Items.HeatFactor).toFixed(4));
        }
        //Dropping items in raid rather deleting them
        if (base._type == "Item" && base._props.DiscardLimit !== undefined && Config.Items.RaidDrop) {
          EditSimpleItemData(id, "DiscardLimit", -1);
        }
        //Turns off weapon overheat
        if (base._props.AllowOverheat !== undefined && Config.Items.WeaponHeatOff) {
          EditSimpleItemData(id, "AllowOverheat", false);
        }
        //Malfunction chance
        if ((base._parent == "5447b5cf4bdc2d65278b4567" || base._parent == "5447b6254bdc2dc3278b4568" || items[id]._parent == "5447b5f14bdc2d61278b4567" || items[id]._parent == "5447bed64bdc2d97278b4568" || items[id]._parent == "5447b6094bdc2dc3278b4567" || items[id]._parent == "5447b5e04bdc2d62278b4567" || items[id]._parent == "5447b6194bdc2d67278b4567") && items[id]._props.BaseMalfunctionChance !== undefined) {
          EditSimpleItemData(id, "BaseMalfunctionChance", parseFloat(base._props.BaseMalfunctionChance * Config.Items.MalfunctChanceMult).toFixed(6));
        }
        if (base._parent == "5448bc234bdc2d3c308b4569" && base._props.MalfunctionChance !== undefined) {
          EditSimpleItemData(id, "MalfunctionChance", parseFloat(base._props.MalfunctionChance * Config.Items.MalfunctChanceMult).toFixed(2));
        }
        //Misfire chance
        if (base._parent == "5485a8684bdc2da71d8b4567" && base._props.MalfMisfireChance !== undefined) {
          EditSimpleItemData(id, "MalfMisfireChance", parseFloat(base._props.MalfMisfireChance * Config.Items.MisfireChance).toFixed(3));
        }
        //Examine all items
        if (Config.Items.AllExaminedItems && Config.Items.ExamineKeys) {
          EditSimpleItemData(id, "ExaminedByDefault", true);
        }
        //Examine all items EXCEPT KEYS, checking for parent IDs of mechanical, keycards and keys in general just in case.
        else if (Config.Items.AllExaminedItems && base._parent !== "5c99f98d86f7745c314214b3" && base.parent !== "5c164d2286f774194c5e69fa" && base.parent !== "543be5e94bdc2df1348b4568") {
          EditSimpleItemData(id, "ExaminedByDefault", true);
        }
        //Change the weight
        if (base._type !== "Node" && base._type !== undefined && (base.parent !== "557596e64bdc2dc2118b4571" || base._parent !== "55d720f24bdc2d88028b456d")) {
          EditSimpleItemData(id, "Weight", parseFloat(Config.Items.WeightChanger * base._props.Weight).toFixed(3));
        }
        if (Config.Items.NoGearPenalty) {
          if (base._props.mousePenalty) {
            EditSimpleItemData(id, "mousePenalty", 0)
          }
          if (base._props.weaponErgonomicPenalty) {
            EditSimpleItemData(id, "weaponErgonomicPenalty", 0)
          }
          if (base._props.speedPenaltyPercent) {
            EditSimpleItemData(id, "speedPenaltyPercent", 0)
          }
        }
        //Ammo Stacks
        if (base._parent.includes("5485a8684bdc2da71d8b4567") && Config.Items.AmmoSwitch) {
          let str = base._name//.split("_", 2)
          if (AmmoFilter(Arrays.Pistol, str)) {
            EditSimpleItemData(id, "StackMaxSize", Config.Items.AmmoStacks.PistolRound)
          }
          else if (AmmoFilter(Arrays.Shotgun, str)) {
            EditSimpleItemData(id, "StackMaxSize", Config.Items.AmmoStacks.ShotgunRound)
          }
          else if (AmmoFilter(Arrays.ARifle, str)) {
            EditSimpleItemData(id, "StackMaxSize", Config.Items.AmmoStacks.RifleRound)
          }
          else if (AmmoFilter(Arrays.MRifle, str)) {
            EditSimpleItemData(id, "StackMaxSize", Config.Items.AmmoStacks.MarksmanRound)
          }
        }
        //Change money stacks
        if (base._parent == "543be5dd4bdc2deb348b4569" && base._props.StackMaxSize !== undefined && Config.Items.EnableCurrency) {
          switch (base._id) {
            case "569668774bdc2da2298b4568":
              EditSimpleItemData(id, "StackMaxSize", Config.Items.EuroStack);
              break;
            case "5696686a4bdc2da3298b456a":
              EditSimpleItemData(id, "StackMaxSize", Config.Items.DollarStack);
              break;
            case "5d235b4d86f7742e017bc88a":
              EditSimpleItemData(id, "StackMaxSize", Config.Items.GPStack);
              break;
            default:
              EditSimpleItemData(id, "StackMaxSize", Config.Items.RubStack);
              break;
          }
        }
        //Allow armored rigs with armors
        if (Config.Items.EquipRigsWithArmors && base._props.BlocksArmorVest !== undefined) {
          EditSimpleItemData(id, "BlocksArmorVest", false);
        }
        //Remove filters
        if (Config.Items.RemoveSecureContainerFilters && base._parent == "5448bf274bdc2dfc2f8b456a" && base._props.Grids[0]._props.filters !== undefined) {
          base._props.Grids[0]._props.filters = [];
        }
        if (Config.Items.RemoveBackpacksRestrictions && base._parent == "5448e53e4bdc2d60728b4567" && base._props.Grids[0]._props.filters !== undefined) {
          base._props.Grids[0]._props.filters = [];
        }
        //Change items experience gain
        if (base._props.LootExperience !== undefined) {
          let calculation = Math.round(base._props.LootExperience * Config.Items.LootExp);
          EditSimpleItemData(id, "LootExperience", calculation);
        }
        if (base._props.ExamineExperience !== undefined) {
          let calculation = Math.round(base._props.ExamineExperience * Config.Items.ExamineExp);
          EditSimpleItemData(id, "ExamineExperience", calculation);
        }
        //Remove the keys usage - God i hate how i wrote it
        if (Config.Items.EnableKeys) {
          if ((base._parent == "5c99f98d86f7745c314214b3") && base._props.MaximumNumberOfUsage !== undefined) {

            if (base._parent == "5c99f98d86f7745c314214b3" && base._props.MaximumNumberOfUsage == 1 && !Config.Items.AvoidSingleKeys) {
              base._props.MaximumNumberOfUsage = 0
            }
            if ( Arrays.MarkedKeys.includes(base._id) && !Config.Items.AvoidMarkedKeys) {
              base._props.MaximumNumberOfUsage = 0
            }
            if (!(Arrays.MarkedKeys.includes(base._id)) && base._props.MaximumNumberOfUsage !== 1) {
              base._props.MaximumNumberOfUsage = 0
            }  
          }

          if (base._parent == "5c164d2286f774194c5e69fa" && base._props.MaximumNumberOfUsage !== undefined && Config.Items.InfiniteKeycards) {
            base._props.MaximumNumberOfUsage = 0
          }
          if (base._parent == "5c99f98d86f7745c314214b3" && base._props.MaximumNumberOfUsage != 0) {
            base._props.MaximumNumberOfUsage *= Config.Items.KeyUseMult
            if (base._props.MaximumNumberOfUsage > Config.Items.KeyDurabilityThreshold) {
              base._props.MaximumNumberOfUsage = Config.Items.KeyDurabilityThreshold
            }
          }
          if (base._parent == "5c164d2286f774194c5e69fa" && base._props.MaximumNumberOfUsage != 0) {
            base._props.MaximumNumberOfUsage *= Config.Items.KeycardUseMult
            if (base._props.MaximumNumberOfUsage > Config.Items.KeyDurabilityThreshold) {
              base._props.MaximumNumberOfUsage = Config.Items.KeyDurabilityThreshold
            }
          }
        }
      }
      if (Config.Items.SMGToHolster) {
        items["55d7217a4bdc2d86028b456d"]._props.Slots[2]._props.filters[0].Filter.push("5447b5e04bdc2d62278b4567");
      }
      if (Config.Items.PistolToMain) {
        items["55d7217a4bdc2d86028b456d"]._props.Slots[0]._props.filters[0].Filter.push("5447b5cf4bdc2d65278b4567", "617f1ef5e8b54b0998387733");
        items["55d7217a4bdc2d86028b456d"]._props.Slots[1]._props.filters[0].Filter.push("5447b5cf4bdc2d65278b4567", "617f1ef5e8b54b0998387733");
      }
      if (Config.Items.RemoveRaidRestr) {
        globals.RestrictionsInRaid = []
      }
      if (Config.Items.IDChanger) {
        //Edit item properties, i know it looks stupid, but hey - it works and i like it.
        //5th revision, now including separate fields for filters, parents and expressions.
        Logger.info("[SVM] Custom Properties is loading", "blue")
        try {
          if (Config.Items.IDParent.length > 0) { //ID=ParentID, same as above
            let ParentList = Config.Items.IDParent.split("\r\n")
            let IDArray = [];
            for (let Line in ParentList) {
              const Variables = ParentList[Line].split(":")
              Logger.info("Parent: " + Variables)
              for (let ids in items) {
                if (Variables[0] == items[ids]._parent) {
                  IDArray.push(items[ids]._id);
                }
              }
              Logger.info("Affected by parent: ")
              Logger.info(IDArray)
              for (let ID in IDArray) {
                Variables[0] = IDArray[ID]
                IDChanger(Variables)
              }
            }
          }
          if (Config.Items.IDDefault.length > 0) {//ID:Variable:Value
            let DefaultList = Config.Items.IDDefault.split("\r\n")
            for (let Line in DefaultList) {
              let Variables = DefaultList[Line].split(":")
              Logger.info("Default: " + Variables)
              IDChanger(Variables)
            }
          }
          if (Config.Items.IDFilter.length > 0) { //ID:Slots/Grids:Grid/Slot Number:Filter/ExcludedFilter:PushIntoArray
            let FilterList = Config.Items.IDFilter.split("\r\n")
            for (let Line in FilterList) {
              const Variables = FilterList[Line].split(":")
              Logger.info("Filter: " + Variables)
              if (Variables.length === 5) {
                let check = CheckType(Variables[4])
                for (let fields in check) {
                  items[Variables[0]]._props[Variables[1]][Variables[2]]._props.filters[0][Variables[3]].push(check[fields])
                }
              }
              else {
                Logger.error("[SVM] INVENTORY AND ITEMS - Filters ID - failed to apply\n")
              }
            }
          }
          if (Config.Items.IDPrice.length > 0) { //ID:Expression:Number
            const handbook = DB.templates.handbook.Items
            let IDPriceLines = Config.Items.IDPrice.split("\r\n")
            for (let Line in IDPriceLines) {
              const Variables = IDPriceLines[Line].split(":")
              Logger.info("Price: " + Variables)
              let IDChecker = true;
              for (let Target in handbook) {
                if (handbook[Target].Id.includes(Variables[0])) {
                  handbook[Target].Price = Calculus(handbook[Target].Price, Variables[1], Variables[2])
                  IDChecker = false;
                  break;
                }
              }
              if (IDChecker) {
                Logger.warning("[SVM] INVENTORY AND ITEMS - Price ID - " + Variables[0] + " - This ID is not found in handbook.\nChecking as ParentID")
                let childs = []
                for (let ID in items) {
                  if (items[ID]._parent == Variables[0]) {
                    childs.push(items[ID]._id)
                  }
                }
                if (childs.length > 0) {
                  Logger.success("[SVM] Success, Changing prices of Child IDs")
                  Logger.info(childs)
                  for (let child in childs) {
                    for (let ID in handbook) {
                      if (handbook[ID].Id.includes(childs[child])) {
                        handbook[ID].Price = Calculus(handbook[ID].Price, Variables[1], Variables[2])
                        break;
                      }
                    }
                  }
                }
                else {
                  Logger.error("[SVM] Price ID Failed, this ID doesn't exist in Items.json")
                }
              }
            }
          }
          Logger.success("[SVM] Custom properties successfully loaded")
        }
        catch (e) {
          Logger.error("[SVM] INVENTORY AND ITEMS - Custom properties failed to load, error of the code:\n" + e)
        }
      }
    }
    //############## PLAYER SECTION ###############
    if (Config.Player.EnablePlayer) {
      //Skill box
      globals.SkillsSettings.SkillProgressRate = Config.Player.SkillProgMult;
      globals.SkillsSettings.WeaponSkillProgressRate = Config.Player.WeaponSkillMult;
      //health after raid box
      Health.healthMultipliers.death = Config.Player.DiedHealth.Health_death;
      Health.healthMultipliers.blacked = Config.Player.DiedHealth.Health_blacked;
      Health.save.health = Config.Player.DiedHealth.Savehealth;
      Health.save.effects = Config.Player.DiedHealth.Saveeffects;
      // skill eff box
      if (Config.Player.EnableFatigue) {
        globals.SkillMinEffectiveness = Config.Player.Skills.SkillMinEffect;
        globals.SkillFatiguePerPoint = Config.Player.Skills.SkillFatiguePerPoint;
        globals.SkillFreshEffectiveness = Config.Player.Skills.SkillFreshEffect;
        globals.SkillFreshPoints = Config.Player.Skills.SkillFPoints;
        globals.SkillPointsBeforeFatigue = Config.Player.Skills.SkillPointsBeforeFatigue;
        globals.SkillFatigueReset = Config.Player.Skills.SkillFatigueReset;
      }
      //############## Player level XP box ############## 
      globals.exp.kill.victimBotLevelExp = Config.Player.CharXP.ScavKill;
      globals.exp.kill.victimLevelExp = Config.Player.CharXP.PMCKill;
      globals.exp.kill.botHeadShotMult = Config.Player.CharXP.ScavHMult;
      globals.exp.kill.pmcHeadShotMult = Config.Player.CharXP.PMCHMult
      //############## END OF RAID Box ############## 
      globals.exp.match_end.runnerMult = Config.Player.RaidMult.Runner
      globals.exp.match_end.miaMult = Config.Player.RaidMult.MIA
      globals.exp.match_end.survivedMult = Config.Player.RaidMult.Survived
      globals.exp.match_end.killedMult = Config.Player.RaidMult.Killed
      //Remove fall damage
      if (Config.Player.FallDamage) {
        globals.Health.Falling.SafeHeight = 200
        globals.Health.Falling.DamagePerMeter = 0
      }
      //Change stamina (unlimited or no)
      if (Config.Player.MaxStamina !== 100 && !Config.Player.UnlimitedStamina) {
        globals.Stamina.Capacity = Config.Player.MaxStamina;
      }
      else if (Config.Player.UnlimitedStamina) {
        globals.Stamina.Capacity = 500;
        globals.Stamina.BaseRestorationRate = 500;
        globals.Stamina.StaminaExhaustionCausesJiggle = false;
        globals.Stamina.StaminaExhaustionStartsBreathSound = false;
        globals.Stamina.StaminaExhaustionRocksCamera = false;
        globals.Stamina.SprintDrainRate = 0;
        globals.Stamina.JumpConsumption = 0;
        globals.Stamina.AimDrainRate = 0;
        globals.Stamina.SitToStandConsumption = 0;
      }
      globals.Health.Effects.Existence.HydrationLoopTime = (globals.Health.Effects.Existence.HydrationLoopTime / Config.Player.HydrationLoss)
      globals.Health.Effects.Existence.EnergyLoopTime = (globals.Health.Effects.Existence.EnergyLoopTime / Config.Player.EnergyLoss)
      globals.Health.Effects.Existence.DestroyedStomachEnergyTimeFactor = Config.Player.BlackStomach;
      globals.Health.Effects.Existence.DestroyedStomachHydrationTimeFactor = Config.Player.BlackStomach;
    }
    //############## HIDEOUT SECTION ##############
    if (Config.Hideout.EnableHideout) {
      //Change hideout fuel consumption
      hideout.settings.generatorFuelFlowRate *= Config.Hideout.FuelConsumptionRate;
      hideout.settings.generatorSpeedWithoutFuel *= Config.Hideout.NoFuelMult;
      //hideoutC.fuelDrainRateMultipler = Config.Hideout.FuelConsumptionRate;
      hideout.settings.airFilterUnitFlowRate *= Config.Hideout.AirFilterRate;
      hideout.settings.gpuBoostRate *= Config.Hideout.GPUBoostRate;

      if (Config.Hideout.EnableStash) {
        items["566abbc34bdc2d92178b4576"]._props.Grids[0]._props.cellsV = Config.Hideout.Stash.StashLvl1
        items["5811ce572459770cba1a34ea"]._props.Grids[0]._props.cellsV = Config.Hideout.Stash.StashLvl2
        items["5811ce662459770f6f490f32"]._props.Grids[0]._props.cellsV = Config.Hideout.Stash.StashLvl3
        items["5811ce772459770e9e5f9532"]._props.Grids[0]._props.cellsV = Config.Hideout.Stash.StashLvl4
        items["6602bcf19cc643f44a04274b"]._props.Grids[0]._props.cellsV = Config.Hideout.Stash.StashTUE
      }
      //Enable hideout fast constructions
      for (const data in hideout.areas) {
        let areaData = hideout.areas[data]
        for (const i in areaData.stages) {
          if (areaData.stages[i].constructionTime > 0) {
            areaData.stages[i].constructionTime = parseInt(areaData.stages[i].constructionTime * Config.Hideout.HideoutConstMult)
            if (areaData.stages[i].constructionTime < 1) {
              areaData.stages[i].constructionTime = 2
            }
          }
        }
      }
      //Enable fast hideout production
      for (const data in hideout.production.recipes) {
        let productionData = hideout.production.recipes[data];

        if (productionData._id == "5d5589c1f934db045e6c5492") {
          productionData.productionTime = Config.Hideout.WaterFilterTime * 60
          productionData.requirements[1].resource = Config.Hideout.WaterFilterRate
        }
        if (productionData._id == "5d5c205bd582a50d042a3c0e") {
          productionData.productionLimitCount = Config.Hideout.MaxBitcoins;
          productionData.productionTime = Config.Hideout.BitcoinTime * 60;
        }
        if (!productionData.continuous && productionData.productionTime >= 10) {
          productionData.productionTime = parseInt(productionData.productionTime * Config.Hideout.HideoutProdMult)
          if (productionData.productionTime < 1) {
            productionData.productionTime = 2
          }
        }
      }
      //Scav cases modifications
      for (const scav in hideout.production.scavRecipes) {
        let caseData = hideout.production.scavRecipes[scav];
        if (caseData.productionTime >= 10) {
          caseData.productionTime = parseInt(caseData.productionTime * Config.Hideout.ScavCaseTime);
          if (caseData.productionTime < 1) {
            caseData.productionTime = 2
          }
        }
      }
      for (const scase in hideout.production.scavRecipes) {
        let caseData = hideout.production.scavRecipes[scase];
        if (caseData.requirements[0].templateId == "5449016a4bdc2d6f028b456f" || caseData.requirements[0].templateId == "5696686a4bdc2da3298b456a" || caseData.requirements[0].templateId == "569668774bdc2da2298b4568") {
          caseData.requirements[0].count = parseInt(caseData.requirements[0].count * Config.Hideout.ScavCasePrice);
        }
      }
      //Remove construction requirements
      if (Config.Hideout.RemoveConstructionsRequirements || Config.Hideout.RemoveSkillRequirements || Config.Hideout.RemoveTraderLevelRequirements) {
        for (const data in hideout.areas) {
          let areaData = hideout.areas[data]
          //Logger.info(areaData.stages[1].requirements[1])
          for (const stage in areaData.stages) {
            if (areaData.stages[stage].requirements !== undefined && areaData.stages[stage].requirements !== "[]") {
              let rewriter = [];
              for (let req in areaData.stages[stage].requirements)//This is horrible
              {
                if (areaData.stages[stage].requirements[req].hasOwnProperty("templateId") && !Config.Hideout.RemoveConstructionsRequirements) {
                  rewriter.push(areaData.stages[stage].requirements[req])
                }
                else if (areaData.stages[stage].requirements[req].hasOwnProperty("skillName") && !Config.Hideout.RemoveSkillRequirements) {
                  rewriter.push(areaData.stages[stage].requirements[req])
                }
                else if (areaData.stages[stage].requirements[req].hasOwnProperty("traderId") && !Config.Hideout.RemoveTraderLevelRequirements) {
                  rewriter.push(areaData.stages[stage].requirements[req])
                }
                else if (areaData.stages[stage].requirements[req].hasOwnProperty("areaType"))//Just for sanity check to avoid certain errors like building bitcoin farm while there is no generator.
                {
                  rewriter.push(areaData.stages[stage].requirements[req])
                }
              }
              areaData.stages[stage].requirements = rewriter
            }
          }
        }
      }
      //Hideout regen menu
      //3.10
      for (let limb in globals.Health.Effects.Regeneration.BodyHealth) {
        globals.Health.Effects.Regeneration.BodyHealth[limb].Value *= Config.Hideout.Regeneration.HealthRegen
      }
      globals.Health.Effects.Regeneration.Energy = Config.Hideout.Regeneration.EnergyRegen
      globals.Health.Effects.Regeneration.Hydration = Config.Hideout.Regeneration.HydrationRegen

      for (const data in hideout.areas) {
        let areaData = hideout.areas[data]
        for (const i in areaData.stages) {
          for (const x in areaData.stages[i].bonuses) {
            if (Config.Hideout.Regeneration.HideoutHydration && areaData.stages[i].bonuses[x].type == "HydrationRegeneration") {
              areaData.stages[i].bonuses[x].value = 0;
            }
            if (Config.Hideout.Regeneration.HideoutEnergy && areaData.stages[i].bonuses[x].type == "EnergyRegeneration") {
              areaData.stages[i].bonuses[x].value = 0;
            }
            if (Config.Hideout.Regeneration.HideoutHealth && areaData.stages[i].bonuses[x].type == "HealthRegeneration") {
              areaData.stages[i].bonuses[x].value = 0;
            }
          }
        }
      }
    }

    //############## RAIDS SECTION ################
    if (Config.Raids.EnableRaids) {
      //############## INRAID SECTION ##################
      if (Config.Raids.RaidStartup.EnableRaidStartup) {
        Inraid.MIAOnRaidEnd = Config.Raids.RaidStartup.MIAEndofRaid;
        Inraid.raidMenuSettings.aiAmount = Arrays.AIAmount[Config.Raids.RaidStartup.AIAmount];
        Inraid.raidMenuSettings.aiDifficulty = Arrays.AIDifficulty[Config.Raids.RaidStartup.AIDifficulty];
        Inraid.raidMenuSettings.bossEnabled = Config.Raids.RaidStartup.EnableBosses;
        Inraid.raidMenuSettings.scavWars = Config.Raids.RaidStartup.ScavWars;
        Inraid.raidMenuSettings.taggedAndCursed = Config.Raids.RaidStartup.TaggedAndCursed;
        Inraid.save.loot = Config.Raids.RaidStartup.SaveLoot;
      }
      if (Config.Raids.ForceSeason) {
        WeatherValues.overrideSeason = Config.Raids.Season;
      }
      trader.fence.coopExtractGift.sendGift = !Config.Raids.Exfils.FenceGift;
      const Midcore = configServer.getConfig("spt-lostondeath");
      if (Config.Raids.SaveQuestItems) {
        Midcore.questItems = false;
      }
      //Low Ground zero level access
      locations["sandbox"].base.RequiredPlayerLevelMax = Config.Raids.SandboxAccessLevel;
      //Time acceleration
      WeatherValues.acceleration = Config.Raids.Timeacceleration
      //Deploy Window time
      globals.TimeBeforeDeployLocal = Config.Raids.RaidStartup.TimeBeforeDeployLocal
      //Always survived
      if (Config.Raids.NoRunThrough) {
        globals.exp.match_end.survived_exp_requirement = 0;
        globals.exp.match_end.survived_seconds_requirement = 0;
      }
      DB.locations["laboratory"].base.Insurance = Config.Raids.LabInsurance;
      //Remove labs entry keycard
      if (Config.Raids.Removelabkey) {
        locations["laboratory"].base.AccessKeys = []
      }

      if (Config.Raids.Exfils.ArmorExtract) {
        globals.RequirementReferences.Alpinist.splice(2, 1)
      }
      if (Config.Raids.Exfils.GearExtract) {
        globals.RequirementReferences.Alpinist.splice(0, 2)
      }
      //Remove extracts restrictions
      for (let i in locations) {
        if (i !== "base") {
          let ExitNames = locations[i].base.exits // 3.10 TODO CHECK
          for (let x in ExitNames) {
            if (ExitNames !== "EXFIL_Train" && (!ExitNames.includes("lab") || ExitNames == "lab_Vent") && ExitNames !== "Saferoom Exfil") {//Ok, i feel dumb again, but i was in a rush ok?

              if (Config.Raids.Exfils.GearExtract && Config.Raids.Exfils.ArmorExtract && locations[i].base.exits[x].PassageRequirement == "Reference") {
                FreeExit(locations[i].base.exits[x])
              }
              if (Config.Raids.Exfils.NoBackpack && locations[i].base.exits[x].PassageRequirement == "Empty") {
                FreeExit(locations[i].base.exits[x])
              }
              if (locations[i].base.exits[x].PassageRequirement == "TransferItem" && Config.Raids.EnableCarCoop) {
                locations[i].base.exits[x].ExfiltrationTime = Config.Raids.Exfils.CarExtractTime;
                switch (i) {
                  case "woods":
                    if (Config.Raids.Exfils.CarWoods !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CarWoods;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "interchange":
                    if (Config.Raids.Exfils.CarInterchange !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CarInterchange;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "bigmap":
                    if (Config.Raids.Exfils.CarCustoms !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CarCustoms;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "tarkovstreets":
                    if (Config.Raids.Exfils.CarStreets !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CarStreets;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "lighthouse":
                    if (Config.Raids.Exfils.CarLighthouse !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CarLighthouse;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "shoreline":
                    if (Config.Raids.Exfils.CarShoreline !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CarShoreline;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "sandbox":
                  case "sandbox_high":
                    if (Config.Raids.Exfils.CarSandbox !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CarSandbox;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  default:
                    break;
                }
              }
              if (Config.Raids.Exfils.CoopPaid && Config.Raids.EnableCarCoop && locations[i].base.exits[x].PassageRequirement == "ScavCooperation") {
                locations[i].base.exits[x].PassageRequirement = "TransferItem";
                locations[i].base.exits[x].ExfiltrationType = "SharedTimer";
                locations[i].base.exits[x].Id = "5449016a4bdc2d6f028b456f";
                locations[i].base.exits[x].PlayersCount = 0;
                locations[i].base.exits[x].RequirementTip = "EXFIL_Item";
                switch (i) {
                  case "woods":
                    if (Config.Raids.Exfils.CoopPaidWoods !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CoopPaidWoods;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "tarkovstreets":
                    if (Config.Raids.Exfils.CoopPaidStreets !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CoopPaidStreets;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "interchange":
                    if (Config.Raids.Exfils.CoopPaidInterchange !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CoopPaidInterchange;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "lighthouse":
                    if (Config.Raids.Exfils.CoopPaidLighthouse !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CoopPaidLighthouse;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "rezervbase":
                    if (Config.Raids.Exfils.CoopPaidReserve !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CoopPaidReserve;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "shoreline":
                    if (Config.Raids.Exfils.CoopPaidShoreline !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CoopPaidShoreline;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  case "sandbox":
                  case "sandbox_high":
                    if (Config.Raids.Exfils.CoopPaidSandbox !== 0) {
                      locations[i].base.exits[x].Count = Config.Raids.Exfils.CoopPaidSandbox;
                    }
                    else {
                      FreeExit(locations[i].base.exits[x])
                    }
                    break;
                  default:
                    break;
                }
              }
              if (Config.Raids.Exfils.FreeCoop && Config.Raids.EnableCarCoop && locations[i].base.exits[x].PassageRequirement == "ScavCooperation") {
                FreeExit(locations[i].base.exits[x])
              }
            }
          }
        }
      }
      //Make all extractions available to extract
      if (Config.Raids.Exfils.ChanceExtracts) {
        for (let i in locations) {
          if (i !== "base") {
            for (let x in locations[i].base.exits) {
              if (locations[i].base.exits[x].Name !== "EXFIL_Train") {
                locations[i].base.exits[x].Chance = 100;
              }
            }
          }
        }
      }
      //Extend raids time
      if (Config.Raids.RaidTime != 0) {
        for (let map in locations) {
          if (map !== "base") {
            if (isJSONValueDefined(locations[map].base.exit_access_time)) {
              locations[map].base.exit_access_time += Config.Raids.RaidTime
            }
            if (isJSONValueDefined(locations[map].base.EscapeTimeLimit)) {
              locations[map].base.EscapeTimeLimit += Config.Raids.RaidTime
            }
          }
        }
      }
      //Make all extractions of the map available regardless of the infill
      if (Config.Raids.Exfils.ExtendedExtracts) {
        for (let map in locations) {
          switch (map) {
            case "bigmap":
              for (const extract in locations[map].base.exits) {
                locations[map].base.exits[extract].EntryPoints = "Customs,Boiler Tanks"
              }
              break;
            case "interchange":
              for (const extract in locations[map].base.exits) {
                locations[map].base.exits[extract].EntryPoints = "MallSE,MallNW"
              }
              break;
            case "shoreline":
              for (const extract in locations[map].base.exits) {
                locations[map].base.exits[extract].EntryPoints = "Village,Riverside"
              }
              break;
            case "woods":
              for (const extract in locations[map].base.exits) {
                locations[map].base.exits[extract].EntryPoints = "House,Old Station"
              }
              break;
            case "lighthouse":
              for (const extract in locations[map].base.exits) {
                locations[map].base.exits[extract].EntryPoints = "Tunnel,North"
              }
              break;
            case "tarkovstreets":
              for (const extract in locations[map].base.exits) {
                locations[map].base.exits[extract].EntryPoints = "E1_2,E6_1,E2_3,E3_4,E4_5,E5_6,E6_1"
              }
              break;
            case "sandbox":
            case "sandbox_high":
              for (const extract in locations[map].base.exits) {
                locations[map].base.exits[extract].EntryPoints = "west,east"
              }
              break;

            default:
              break;
          }
        }
      }
      Events.events[0].settings.zombieSettings.enabled = !Config.Raids.RaidEvents.DisableZombies
      //Explanation of this - Turns out SPT's method doesn't seem to convert upper case to lower case with the maps, while BSG's UI requests exactly uppercased scenario
      //In the end we have bigmap and lab only spawning waves because they are consistent on both sides. I hate my life.
      if (Config.Raids.RaidEvents.RandomInfectionLevel) {
        Events.events[0].settings.zombieSettings.mapInfectionAmount =
        {
          "laboratory": 100,
          "bigmap": Math.floor(Math.random() * 100),
          "woods": Math.floor(Math.random() * 100),
          "shoreline": Math.floor(Math.random() * 100),
          "sandbox": Math.floor(Math.random() * 100),
          "rezervbase": Math.floor(Math.random() * 100),
          "tarkovstreets": Math.floor(Math.random() * 100),
          "factory4": Math.floor(Math.random() * 100),
          "lighthouse": Math.floor(Math.random() * 100),
          "interchange": Math.floor(Math.random() * 100)
        }
        //Hopefully a temporary fix
        Events.events[0].settings.zombieSettings.mapInfectionAmount["Woods"] = Events.events[0].settings.zombieSettings.mapInfectionAmount["woods"]
        Events.events[0].settings.zombieSettings.mapInfectionAmount["Shoreline"] = Events.events[0].settings.zombieSettings.mapInfectionAmount["shoreline"]
        Events.events[0].settings.zombieSettings.mapInfectionAmount["RezervBase"] = Events.events[0].settings.zombieSettings.mapInfectionAmount["rezervbase"]
        Events.events[0].settings.zombieSettings.mapInfectionAmount["TarkovStreets"] = Events.events[0].settings.zombieSettings.mapInfectionAmount["tarkovstreets"]
        Events.events[0].settings.zombieSettings.mapInfectionAmount["Lighthouse"] = Events.events[0].settings.zombieSettings.mapInfectionAmount["lighthouse"]
        Events.events[0].settings.zombieSettings.mapInfectionAmount["Interchange"] = Events.events[0].settings.zombieSettings.mapInfectionAmount["interchange"]
        for(let map in Events.eventBossSpawns.halloweenzombies)
        {
          for (let wave in Events.eventBossSpawns.halloweenzombies[map])
          {
            switch(map)//Feature - Infection level affects spawn chances.
            {
            case "factory4_day":
              Events.eventBossSpawns.halloweenzombies[map][wave].BossChance = Events.events[0].settings.zombieSettings.mapInfectionAmount.factory4;
              break;
            case "factory4_night":
              Events.eventBossSpawns.halloweenzombies[map][wave].BossChance = Events.events[0].settings.zombieSettings.mapInfectionAmount.factory4;
            break;
            case "sandbox":
              Events.eventBossSpawns.halloweenzombies[map][wave].BossChance = Events.events[0].settings.zombieSettings.mapInfectionAmount.Sandbox;
            break;
            case "sandbox_high":
              Events.eventBossSpawns.halloweenzombies[map][wave].BossChance = Events.events[0].settings.zombieSettings.mapInfectionAmount.Sandbox;
            break;
               default:
                if (Events.events[0].settings.zombieSettings.mapInfectionAmount[map] !== undefined){
                Events.eventBossSpawns.halloweenzombies[map][wave].BossChance = Events.events[0].settings.zombieSettings.mapInfectionAmount[map];
                }
                break;
            }
          }
        }
      }
      Events.enableSeasonalEventDetection = !Config.Raids.RaidEvents.DisableEvents
      if (Config.Raids.RaidEvents.RaidersEverywhere) // 3.9.0 Raider rework, need to split them up into 3 fields - Start of the raid Scavs, PMC and general waves.
      {
        for (let i in locations)//Locations DB
        {
          if (i !== "base" && locations[i].base.waves) {
            for (let x in locations[i].base.waves) {
              locations[i].base.waves[x].WildSpawnType = "pmcBot"
            }
          }
        }
        for (let loc in locs.customWaves.boss) {
          for (let ai in locs.customWaves.boss[loc]) {
            locs.customWaves.boss[loc][ai].BossName = "pmcBot";
            locs.customWaves.boss[loc][ai].BossEscortType = "pmcBot";
          }
        }
        for (let loc in locs.customWaves.normal) {
          for (let ai in locs.customWaves.normal[loc]) {
            locs.customWaves.normal[loc][ai].WildSpawnType = "pmcBot"
          }
        }
      }
      if (Config.Raids.RaidEvents.KillaFactory) {
        const KillaWave = CreateBoss("bossKilla", Config.Raids.RaidEvents.KillaFactoryChance, "followerBully", 0, locations["factory4_day"].base.OpenZones)
        locations["factory4_day"].base.BossLocationSpawn.push(KillaWave)
        locations["factory4_night"].base.BossLocationSpawn.push(KillaWave)
      }
      if (Config.Raids.RaidEvents.TagillaInterchange) {
        for (let bosscheck in locations["interchange"].base.BossLocationSpawn)//Looking for exactly Killa wave, even tho he is the only boss here, safety measure
        {
          if (locations["interchange"].base.BossLocationSpawn[bosscheck].BossName == "bossKilla") {
            locations["interchange"].base.BossLocationSpawn[bosscheck].BossEscortAmount = 1 
            locations["interchange"].base.BossLocationSpawn[bosscheck].BossEscortType = "bossTagilla"
          }
        }
      }
      const Waves = require('../src/Waves.json');
      if (Config.Raids.RaidEvents.BossesOnReserve) {
        let BossWave = CreateBoss("bossKilla", 100, "followerBully", "0", locations["rezervbase"].base.OpenZones)
        locations["rezervbase"].base.BossLocationSpawn.push(BossWave)
        BossWave = CreateBoss("bossBully", 100, "followerBully", "4", locations["rezervbase"].base.OpenZones)
        locations["rezervbase"].base.BossLocationSpawn.push(BossWave)
        BossWave = CreateBoss("bossKojaniy", 100, "followerKojaniy", "2", locations["rezervbase"].base.OpenZones)
        locations["rezervbase"].base.BossLocationSpawn.push(BossWave)
        BossWave = CreateBoss("bossSanitar", 100, "followerSanitar", "2", locations["rezervbase"].base.OpenZones)
        locations["rezervbase"].base.BossLocationSpawn.push(BossWave)
        BossWave = CreateBoss("bossTagilla", 100, "followerBully", "0", locations["rezervbase"].base.OpenZones)
        locations["rezervbase"].base.BossLocationSpawn.push(BossWave)
        if (Config.Raids.RaidEvents.IncludeStreetBosses) {
          const Kaban = Waves.Kaban
          Kaban.BossZone = locations["rezervbase"].base.OpenZones
          locations["rezervbase"].base.BossLocationSpawn.push(Kaban)
          const Kolontay = Waves.Kolontay
          Kaban.BossZone = locations["rezervbase"].base.OpenZones
          locations["rezervbase"].base.BossLocationSpawn.push(Kolontay)
        }
      }
      if (Config.Raids.RaidEvents.BossesOnHealthResort) {
        if (Config.Raids.RaidEvents.HealthResortIncludeGuards) {
          let BossWave = CreateBoss("bossKilla", 100, "followerBully", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossBully", 100, "followerBully", 4, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossKojaniy", 100, "followerKojaniy", 2, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossSanitar", 100, "followerSanitar", 2, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossTagilla", 100, "followerBully", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          const Goons = Waves.Goons
          Goons.BossZone = "ZoneSanatorium1,ZoneSanatorium2"
          locations["shoreline"].base.BossLocationSpawn.push(Goons)
          const Glukhar = Waves.Glukhar
          Glukhar.BossZone = "ZoneSanatorium1,ZoneSanatorium2"
          locations["shoreline"].base.BossLocationSpawn.push(Glukhar)
          const Kaban = Waves.Kaban
          Kaban.BossZone = "ZoneSanatorium1,ZoneSanatorium2"
          locations["shoreline"].base.BossLocationSpawn.push(Kaban)
          const Kolontay = Waves.Kolontay
          Kolontay.BossZone = "ZoneSanatorium1,ZoneSanatorium2"
          locations["shoreline"].base.BossLocationSpawn.push(Kolontay)//can be shorted harder, will leave it for the next time.
        }
        else {
          let BossWave = CreateBoss("bossKilla", 100, "followerBully", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossBully", 100, "followerBully", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossKojaniy", 100, "followerKojaniy", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossSanitar", 100, "followerSanitar", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossTagilla", 100, "followerBully", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossGluhar", 100, "followerBully", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossBoar", 100, "followerKojaniy", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          BossWave = CreateBoss("bossKolontay", 100, "followerSanitar", 0, "ZoneSanatorium1,ZoneSanatorium2")
          locations["shoreline"].base.BossLocationSpawn.push(BossWave)
          const Goons = Waves.Goons
          Goons.BossZone = "ZoneSanatorium1,ZoneSanatorium2"
          locations["shoreline"].base.BossLocationSpawn.push(Goons)
        }
      }
      if (Config.Raids.RaidEvents.BossesOnCustoms) {
        for (let bosses in locations["bigmap"].base.BossLocationSpawn) {
          if (locations["bigmap"].base.BossLocationSpawn[bosses].BossName == "bossBully") {
            locations["bigmap"].base.BossLocationSpawn[bosses].BossChance = 100;
          }
        }
        let BossWave = CreateBoss("bossKilla", 100, "followerBully", 0, "ZoneOldAZS")
        locations["bigmap"].base.BossLocationSpawn.push(BossWave)
        BossWave = CreateBoss("bossKojaniy", 100, "followerKojaniy", 2, "ZoneFactoryCenter")
        locations["bigmap"].base.BossLocationSpawn.push(BossWave)
        BossWave = CreateBoss("bossSanitar", 100, "followerSanitar", 2, "ZoneGasStation")
        locations["bigmap"].base.BossLocationSpawn.push(BossWave)
        BossWave = CreateBoss("bossTagilla", 100, "followerBully", 0, "ZoneOldAZS")
        locations["bigmap"].base.BossLocationSpawn.push(BossWave)
        const Glukhar = Waves.Glukhar
        Glukhar.BossZone = "ZoneScavBase"
        locations["bigmap"].base.BossLocationSpawn.push(Glukhar)
      }
      if (Config.Raids.RaidEvents.GoonsFactory) {
        const Goons = Waves.Goons;
        Goons.BossZone = "BotZone";
        Goons.BossChance = Config.Raids.RaidEvents.GoonsFactoryChance;
        locations["factory4_day"].base.BossLocationSpawn.push(Goons)
        locations["factory4_night"].base.BossLocationSpawn.push(Goons)
      }
      if (Config.Raids.RaidEvents.GlukharLabs) {//BossZone": "BotZoneFloor1,BotZoneFloor2", // "BossChance": 43,
        const Glukhar = Waves.Glukhar
        Glukhar.BossZone = "BotZoneFloor1,BotZoneFloor2"
        locations["laboratory"].base.BossLocationSpawn.push(Glukhar)
      }
      for (let i in locations)//Bloodhounds events spawn chance - this is bad solution, but i made it on a quick hand, not sure this event lasts either.
      {
        if (i !== "base" && locations[i].base.BossLocationSpawn) {
          for (let x in locations[i].base.BossLocationSpawn) {
            if (locations[i].base.BossLocationSpawn[x].BossName == "arenaFighterEvent" && i == "bigmap") {
              locations[i].base.BossLocationSpawn[x].BossChance = Config.Raids.RaidEvents.HoundsCustoms
            }
            if (locations[i].base.BossLocationSpawn[x].BossName == "arenaFighterEvent" && i == "woods") {
              locations[i].base.BossLocationSpawn[x].BossChance = Config.Raids.RaidEvents.HoundsWoods
            }
            if (locations[i].base.BossLocationSpawn[x].BossName == "peacemaker" && i == "shoreline") {
              locations[i].base.BossLocationSpawn[x].BossChance = Config.Raids.RaidEvents.PeaceFighters
            }
            if (locations[i].base.BossLocationSpawn[x].BossName == "skier" && i == "bigmap") {
              locations[i].base.BossLocationSpawn[x].BossChance = Config.Raids.RaidEvents.SkierFighters
            }
          }
        }
      }
      //#######BTR STUFF
      if (Config.Raids.EnableBTR) {
        if (Config.Raids.ForceBTRFriendly) {
          for (let levels in globals.FenceSettings.Levels) {
            globals.FenceSettings.Levels[levels].CanInteractWithBtr = true;
          }
        }
        if (Config.Raids.ForceBTRStash) {
          for (let levels in globals.FenceSettings.Levels) {
            globals.FenceSettings.Levels[levels].DeliveryGridSize["x"] = Config.Raids.BTRWidth
            globals.FenceSettings.Levels[levels].DeliveryGridSize["y"] = Config.Raids.BTRHeight
          }
        }
        globals.BTRSettings.BasePriceTaxi = Config.Raids.BTRTaxiPrice
        globals.BTRSettings.CleanUpPrice = Config.Raids.BTRCoverPrice
        globals.BTRSettings.BearPriceMod = Config.Raids.BearMults
        globals.BTRSettings.UsecPriceMod = Config.Raids.UsecMult
        globals.BTRSettings.ScavPriceMod = Config.Raids.ScavMult
      }
    }
    //############## TRADERS SECTION ##############
    if (Config.Traders.EnableTraders) {
      if (Config.Traders.Fence.EnableFence) {
        trader.fence.assortSize = Config.Traders.Fence.AmountOnSale;
        trader.fence.discountOptions.assortSize = Config.Traders.Fence.PremiumAmountOnSale;
        trader.fence.weaponPresetMinMax.min = Config.Traders.Fence.PresetCount;
        trader.fence.weaponPresetMinMax.max = Config.Traders.Fence.PresetCount;
        trader.fence.presetPriceMult = Config.Traders.Fence.PresetMult;
        trader.fence.itemPriceMult = Config.Traders.Fence.PriceMult;
        for (let stock in trader.updateTime)//useless cycle for now, will remove later.
        {
          if (trader.updateTime[stock]._name == "fence" && trader.updateTime[stock].seconds.min != undefined) {
            trader.updateTime[stock].seconds.min = Config.Traders.Fence.StockTime_Min * 60;
            trader.updateTime[stock].seconds.max = Config.Traders.Fence.StockTime_Max * 60;
          }
        }
        trader.fence.weaponDurabilityPercentMinMax.current.min = Config.Traders.Fence.GunDurability_Min
        trader.fence.weaponDurabilityPercentMinMax.current.max = Config.Traders.Fence.GunDurability_Max
        trader.fence.armorMaxDurabilityPercentMinMax.current.min = Config.Traders.Fence.ArmorDurability_Min
        trader.fence.armorMaxDurabilityPercentMinMax.current.max = Config.Traders.Fence.ArmorDurability_Max
        let BlacklistArray = Config.Traders.Fence.Blacklist.split("\r\n");
        BlackItems.blacklist.push(BlacklistArray);
      }
      globals.TradingSettings.BuyoutRestrictions.MinDurability = Config.Traders.MinDurabSell / 100
      Quest.redeemTime = Config.Traders.QuestRedeemTime;
      trader.purchasesAreFoundInRaid = Config.Traders.FIRTrade;
      traders["5c0647fdd443bc2504c2d371"].base.unlockedByDefault = Config.Traders.UnlockJaeger
      traders["6617beeaa9cfa777ca915b7c"].base.unlockedByDefault = Config.Traders.UnlockRef
      const Mark = Config.Traders.TraderMarkup;
      const MarkArray = [Mark.Prapor,
      Mark.Therapist,
      Mark.Fence,
      Mark.Skier,
      Mark.Peacekeeper,
      Mark.Mechanic,
      Mark.Ragman,
      Mark.Jaeger
      ]
      let i = 0;
      for (let CurTrader in traders) {//Bad solution to avoid modded traders.
        if (CurTrader !== "ragfair" && (CurTrader == "5a7c2eca46aef81a7ca2145d" || CurTrader == "5ac3b934156ae10c4430e83c" ||
          CurTrader == "5c0647fdd443bc2504c2d371" || CurTrader == "54cb50c76803fa8b248b4571" || CurTrader == "54cb57776803fa99248b456e" ||
          CurTrader == "579dc571d53a0658a154fbec" || CurTrader == "5935c25fb3acc3127c3d8cd9" || CurTrader == "58330581ace78e27b8b10cee")) {
          for (let level in traders[CurTrader].base.loyaltyLevels) {
            traders[CurTrader].base.loyaltyLevels[level].buy_price_coef = 100 - MarkArray[i]
          }
          i++
        }
      }
      //Enable all the quests
      if (Config.Traders.AllQuestsAvailable) {
        for (let id in Quests) {
          let QuestData = Quests[id]
          QuestData.conditions.AvailableForStart = [
            {
              "_parent": "Level",
              "_props":
              {
                "compareMethod": ">=",
                "value": "1",
                "index": 0,
                "parentId": "",
                "id": "683a4e6b255f7527fb05a0f6"
              }
            }]
        }
      }
      if (Config.Traders.FIRRestrictsQuests) {
        for (const id in Quests) {
          let condition = Quests[id].conditions.AvailableForFinish
          for (const requirements in condition) {
            if (condition[requirements].onlyFoundInRaid !== undefined) {
              condition[requirements].onlyFoundInRaid = false;
            }
          }
        }
      }
      if (Config.Traders.RemoveTimeCondition) {
        for (const id in Quests) {
          let condition = Quests[id].conditions.AvailableForStart
          for (const requirements in condition) {
            if (condition[requirements].availableAfter !== undefined) {
              condition[requirements].availableAfter = 0;
            }
          }
        }
      }
      //Enable all traders 4 stars
      if (Config.Traders.TradersLvl4) {
        for (let traderID in traders) {
          let loyaltyLevels = traders[traderID].base.loyaltyLevels;
          for (let level in loyaltyLevels) {
            loyaltyLevels[level].minLevel = 1
            loyaltyLevels[level].minSalesSum = 0
            loyaltyLevels[level].minStanding = 0
          }
        }
      }
      if (Config.Traders.UnlockQuestAssort) {
        for (let AssortR in traders) {
          if (AssortR !== "ragfair" && AssortR !== "638f541a29ffd1183d187f57" && traders[AssortR].questassort.success !== undefined) {
            traders[AssortR].questassort.success = {}
          }
        }
      }
      if (Config.Traders.RemoveTradeLimits) {
        for (let AssortR in traders) {
          if (AssortR !== "ragfair" && AssortR !== "638f541a29ffd1183d187f57") {
            for (let level in traders[AssortR].assort.items) {
              if (traders[AssortR].assort.items[level].upd !== undefined && traders[AssortR].assort.items[level].upd["BuyRestrictionMax"] !== undefined) {
                traders[AssortR].assort.items[level].upd["BuyRestrictionMax"] = 999999;
              }
            }
          }
        }
      }
      if (Config.Traders.IncreaseAssort) {
        for (let AssortR in traders) {
          if (AssortR !== "ragfair" && AssortR !== "638f541a29ffd1183d187f57") {
            for (let level in traders[AssortR].assort.items) {
              if (traders[AssortR].assort.items[level].upd !== undefined && traders[AssortR].assort.items[level].upd["StackObjectsCount"] !== undefined) {
                traders[AssortR].assort.items[level].upd["StackObjectsCount"] = 1337420;
              }
            }
          }
        }
      }
      //sell assort
      const Sell = Config.Traders.TraderSell;
      const SellArray = [Sell.Prapor,
      Sell.Therapist,
      Sell.Skier,
      Sell.Peacekeeper,
      Sell.Mechanic,
      Sell.Ragman,
      Sell.Jaeger
      ]
      let p = 0;
      for (let CurTrader in Arrays.traderArray) {
        for (let assortment in traders[Arrays.traderArray[CurTrader]].assort.barter_scheme) {
          if (traders[Arrays.traderArray[CurTrader]].assort.barter_scheme[assortment][0][0]._tpl == "5449016a4bdc2d6f028b456f" ||
            traders[Arrays.traderArray[CurTrader]].assort.barter_scheme[assortment][0][0]._tpl == "569668774bdc2da2298b4568" ||
            traders[Arrays.traderArray[CurTrader]].assort.barter_scheme[assortment][0][0]._tpl == "5696686a4bdc2da3298b456a") {
            let TempValue = (traders[Arrays.traderArray[CurTrader]].assort.barter_scheme[assortment][0][0].count * SellArray[p]).toFixed(2)//testing
            traders[Arrays.traderArray[CurTrader]].assort.barter_scheme[assortment][0][0].count = parseFloat(TempValue)
          }
        }
        p++;
      }
      if (Config.Traders.RemoveCurrencyOffers) {
        for (let CurTrader in traders) {
          if (CurTrader !== "ragfair" && CurTrader !== "638f541a29ffd1183d187f57" && CurTrader !== "579dc571d53a0658a154fbec") //avoid ragfair, lighthouse trader and fence
          {
            for (let assortment in traders[CurTrader].assort.barter_scheme) {
              if (traders[CurTrader].assort.barter_scheme[assortment][0][0]._tpl == "5449016a4bdc2d6f028b456f" ||
                traders[CurTrader].assort.barter_scheme[assortment][0][0]._tpl == "569668774bdc2da2298b4568" ||
                traders[CurTrader].assort.barter_scheme[assortment][0][0]._tpl == "5696686a4bdc2da3298b456a") {
                for (let DeletElem in traders[CurTrader].assort.items) {//3.10 rework instead of deleting assort - set everything to 0 instead.
                  if (traders[CurTrader].assort.items[DeletElem]._id == assortment) {
                    if (traders[CurTrader].assort.items[DeletElem].upd.UnlimitedCount !== undefined) {
                      traders[CurTrader].assort.items[DeletElem].upd.UnlimitedCount = false;
                    }
                    traders[CurTrader].assort.items[DeletElem].upd["StackObjectsCount"] = 0;
                  }
                }
              }
            }
          }
        }
      }

      if (Config.Traders.RemoveBarterOffers) {
        for (let CurTrader in traders) {
          if (CurTrader !== "ragfair" && CurTrader !== "638f541a29ffd1183d187f57" && CurTrader !== "579dc571d53a0658a154fbec") {
            for (let assortment in traders[CurTrader].assort.barter_scheme) {
              if (traders[CurTrader].assort.barter_scheme[assortment][0][0]._tpl !== "5449016a4bdc2d6f028b456f" &&
                traders[CurTrader].assort.barter_scheme[assortment][0][0]._tpl !== "569668774bdc2da2298b4568" &&
                traders[CurTrader].assort.barter_scheme[assortment][0][0]._tpl !== "5696686a4bdc2da3298b456a") {
                for (let DeletElem in traders[CurTrader].assort.items) {
                  if (traders[CurTrader].assort.items[DeletElem]._id == assortment) {
                    if (traders[CurTrader].assort.items[DeletElem].upd.UnlimitedCount !== undefined) {
                      traders[CurTrader].assort.items[DeletElem].upd.UnlimitedCount = false;
                    }
                    traders[CurTrader].assort.items[DeletElem].upd["StackObjectsCount"] = 0;
                  }
                }
              }
            }
          }
        }
      }
    }
    //############## PMC SECTION ##################,
    if (Config.PMC.EnablePMC) {
      if (Config.PMC.EnableConvert) {
        PMC.convertIntoPmcChance.default.assault.min = Config.PMC.AItoPMC.ScavToPMC;
        PMC.convertIntoPmcChance.default.cursedassault.min = Config.PMC.AItoPMC.CursedToPMC;
        PMC.convertIntoPmcChance.default.pmcbot.min = Config.PMC.AItoPMC.RaiderToPMC;
        PMC.convertIntoPmcChance.default.exusec.min = Config.PMC.AItoPMC.RogueToPMC;
        PMC.convertIntoPmcChance.default.marksman = {};
        PMC.convertIntoPmcChance.default.marksman.min = Config.PMC.AItoPMC.SnipertoPMC;

        PMC.convertIntoPmcChance.default.assault.max = Config.PMC.AItoPMC.ScavToPMC;
        PMC.convertIntoPmcChance.default.cursedassault.max = Config.PMC.AItoPMC.CursedToPMC;
        PMC.convertIntoPmcChance.default.pmcbot.max = Config.PMC.AItoPMC.RaiderToPMC;
        PMC.convertIntoPmcChance.default.exusec.max = Config.PMC.AItoPMC.RogueToPMC;
        PMC.convertIntoPmcChance.default.marksman.max = Config.PMC.AItoPMC.SniperToPMC;
        PMC.isUsec = Config.PMC.PMCRatio;
      }
      PMC.botRelativeLevelDeltaMax = Config.PMC.LevelUpMargin;
      PMC.botRelativeLevelDeltaMin = Config.PMC.LevelDownMargin;
      if (Config.PMC.ChancesEnable) {
        PMC.chanceSameSideIsHostilePercent = Config.PMC.PMCChance.HostilePMC;
        PMC.looseWeaponInBackpackChancePercent = Config.PMC.PMCChance.PMCLooseWep;
        PMC.weaponHasEnhancementChancePercent = Config.PMC.PMCChance.PMCWepEnhance;
        PMC.addPrefixToSameNamePMCAsPlayerChance = Config.PMC.PMCChance.PMCNamePrefix;
        PMC.allPMCsHavePlayerNameWithRandomPrefixChance = Config.PMC.PMCChance.PMCAllNamePrefix;
      }
      //Lootable melees
      for (const id in items) {
        let base = items[id]
        if (base._parent === "5447e1d04bdc2dff2f8b4567" && base._id !== "6087e570b998180e9f76dc24" && Config.PMC.LootableMelee) {
          EditSimpleItemData(id, "Unlootable", false);
          items[id]._props.UnlootableFromSide = [];
        }
      }
      if (Config.PMC.DisableLowLevelPMC) {
        Bots.equipment.pmc.randomisation[0].levelRange.max = 1;
        Bots.equipment.pmc.randomisation[1].levelRange.min = 1;
        Bots.equipment.pmc.randomisation[2].levelRange.min = 1;
        Bots.equipment.pmc.randomisation[3].levelRange.min = 1;
        //Bots.equipment.pmc.randomisation[4].levelRange.min = 1;
      }
      if (Config.PMC.NamesEnable) {
        if (Config.PMC.NameOverride) {
          let Names = Config.PMC.PMCNameList.split("\r\n")
          Bot["pmcusec"].firstName = Names;
          Bot["pmcbear"].firstName = Names;
          Bot["usec"].firstName = Names;
          Bot["bear"].firstName = Names;
        }
        else {
          let Names = Config.PMC.PMCNameList.split("\r\n")
          for (const name in Names)//I don't really remember should i even have this cycle here, but eh, cba.
          {
            Bot["pmcusec"].firstName.push(Names[name])
            Bot["pmcbear"].firstName.push(Names[name])
            Bot["usec"].firstName.push(Names[name])
            Bot["bear"].firstName.push(Names[name])
          }
        }
      }
    }
    //############## REPEATABLE QUESTS SECTION #############
    if (Config.Quests.EnableQuests) {
      const Daily = Config.Quests.DailyQuests;
      const Weekly = Config.Quests.WeeklyQuests;
      const ScavDaily = Config.Quests.ScavQuests;
      //Requirements
      QuestDetails(Daily, "0")
      QuestDetails(Weekly, "1")
      QuestDetails(ScavDaily, "2")
      //Rewards
      QuestReward(Daily, "0")
      QuestReward(Weekly, "1")
      QuestReward(ScavDaily, "2")
    }
    //############## SCAV SECTION ############## I wish i never made one, but here we are
    if (Config.Scav.EnableScav) {
      //Base Fence rep given by car extract
      Inraid.carExtractBaseStandingGain = Config.Scav.CarBaseStanding
      //Allow Scav into Lab
      locations["laboratory"].base.DisabledForScav = !Config.Scav.ScavLab;
      //Scav Cooldown Timer
      globals.SavagePlayCooldown = Config.Scav.ScavTimer;

      for (let levels in globals.FenceSettings.Levels)//Damn it looks counter intuitive
      {
        if (Config.Scav.HostileScavs) {
          globals.FenceSettings.Levels[levels].HostileScavs = Config.Scav.HostileScavs
        }
        if (Config.Scav.HostileBosses) {
          globals.FenceSettings.Levels[levels].HostileBosses = Config.Scav.HostileScavs
        }
        if (Config.Scav.FriendlyScavs) {
          globals.FenceSettings.Levels[levels].HostileScavs = !Config.Scav.FriendlyScavs
        }
        if (Config.Scav.FriendlyBosses) {
          globals.FenceSettings.Levels[levels].HostileBosses = !Config.Scav.FriendlyBosses
        }
      }
      if (Config.Scav.ScavCustomPockets) {
        const JsonUtil = container.resolve("JsonUtil");
        let ScavCustomPocketItem = JsonUtil.clone(items["557ffd194bdc2d28148b457f"])
        let ScavPocketSize = Config.Scav.SCAVPockets
        ScavCustomPocketItem._id = "a8edfb0bce53d103d3f6219b"
        for (let cell in ScavCustomPocketItem._props.Grids)//tried to make less code, made more, smh.
        {
          ScavCustomPocketItem._props.Grids[cell]._parent = "a8edfb0bce53d103d3f6219b"
        }
        ScavCustomPocketItem._props.Grids[0]._id = "a8edfb0bce53d103d3f6229b"
        ScavCustomPocketItem._props.Grids[0]._props.cellsH = ScavPocketSize.FirstWidth
        ScavCustomPocketItem._props.Grids[0]._props.cellsV = ScavPocketSize.FirstHeight
        ScavCustomPocketItem._props.Grids[1]._id = "a8edfb0bce53d103d3f6239b"
        ScavCustomPocketItem._props.Grids[1]._props.cellsH = ScavPocketSize.SecondWidth
        ScavCustomPocketItem._props.Grids[1]._props.cellsV = ScavPocketSize.SecondHeight
        ScavCustomPocketItem._props.Grids[2]._id = "a8edfb0bce53d103d3f6249b"
        ScavCustomPocketItem._props.Grids[2]._props.cellsH = ScavPocketSize.ThirdWidth
        ScavCustomPocketItem._props.Grids[2]._props.cellsV = ScavPocketSize.ThirdHeight
        ScavCustomPocketItem._props.Grids[3]._id = "a8edfb0bce53d103d3f6259b"
        ScavCustomPocketItem._props.Grids[3]._props.cellsH = ScavPocketSize.FourthWidth
        ScavCustomPocketItem._props.Grids[3]._props.cellsV = ScavPocketSize.FourthHeight
        switch (true) {
          case ScavPocketSize.FourthWidth == 0 || ScavPocketSize.FourthHeight == 0:
            ScavCustomPocketItem._props.Grids.splice(3, 1)
          case ScavPocketSize.ThirdWidth == 0 || ScavPocketSize.ThirdHeight == 0:
            ScavCustomPocketItem._props.Grids.splice(2, 1);
          case ScavPocketSize.SecondWidth == 0 || ScavPocketSize.SecondHeight == 0:
            ScavCustomPocketItem._props.Grids.splice(1, 1);
          case ScavPocketSize.FirstWidth == 0 || ScavPocketSize.FirstHeight == 0:
            ScavCustomPocketItem._props.Grids.splice(0, 1);
            break;
          default:
            break;
        }
        items["a8edfb0bce53d103d3f6219b"] = ScavCustomPocketItem;
      }
    }
    //############## CUSTOM SECTION ##############
    if (Config.Custom.EnableCustom) {
      if (Config.Custom.LoggerIntoServer) {
        Logger.warning("[SVM] PRESET IS BEING LOGGED INTO SERVER, DO NOT USE THIS FEATURE UNDER NORMAL CIRCUMSTANCES")
        Logger.debug(Config)
      }
      const Core = configServer.getConfig("spt-core");
      Core.features.chatbotFeatures.sptFriendEnabled = !Config.Custom.DisableSPTFriend
      Core.features.chatbotFeatures.commandoEnabled = !Config.Custom.DisableCommando
      if (Config.Custom.DisablePMCMessages) {
        const Chat = configServer.getConfig("spt-pmcchatresponse");
        Chat.victim.responseChancePercent = 0;
        Chat.killer.responseChancePercent = 0;
      }

      //If you're reading here, maybe you checked that custom fields exist now, 
      //feel free to use this place to run your own little scripts using SVM as a framework, Search word is `banana`
      //Mind you, Custom section needs to be enabled, you can however write stuff after the bracket there to run the code if at least preset exist.
      //Fields names are `CustomCheck1,2,3,4` and `CustomNumber1,2,3,4`
    }
    //#####

    //############## FUNCTIONS ##############
    //Set a Unique AI type spawn within selected location, with a lot of variables to come in.
    function CreateBoss(role, chance, followers, escortAmount, zones) {
      return {
        "BossName": role,
        "BossChance": chance,
        "BossZone": zones,
        "BossPlayer": false,
        "BossDifficult": "normal",
        "BossEscortType": followers,
        "BossEscortDifficult": "normal",
        "BossEscortAmount": escortAmount,
        "Time": -1
      }
    }
    function Filter(value) {
      let test = value.substring(1, value.length - 1)
      let result = test.split(",")
      return result
    }
    function EditSimpleItemData(id, data, value) {
      if (isNaN(value) && value !== 'true' && value !== 'false') {
        items[id]._props[data] = value
      }
      else {
        items[id]._props[data] = JSON.parse(value)
      }
    }
    function QuestDetails(Type, Digit) {
      Quest.repeatableQuests[Digit].resetTime = Type.Lifespan * 60;
      Quest.repeatableQuests[Digit].types = []
      if (Digit < 2) {
        switch (Type.Types)//Horrible
        {
          case 0: Quest.repeatableQuests[Digit].types.push(Arrays.Types[0])
            break;
          case 1: Quest.repeatableQuests[Digit].types.push(Arrays.Types[1])
            break;
          case 2: Quest.repeatableQuests[Digit].types.push(Arrays.Types[2])
            break;
          case 3: Quest.repeatableQuests[Digit].types.push(Arrays.Types[0], Arrays.Types[1])
            break;
          case 4: Quest.repeatableQuests[Digit].types.push(Arrays.Types[1], Arrays.Types[2])
            break;
          case 5: Quest.repeatableQuests[Digit].types.push(Arrays.Types[2], Arrays.Types[2])
            break;
          case 6: Quest.repeatableQuests[Digit].types.push(Arrays.Types[0], Arrays.Types[1], Arrays.Types[2])
            break;
        }
      }
      else {
        switch (Type.Types) {
          case 0: Quest.repeatableQuests[2].types.push(Arrays.Types[0])
            break;
          case 1: Quest.repeatableQuests[2].types.push(Arrays.Types[1])
            break;
          case 2: Quest.repeatableQuests[2].types.push(Arrays.Types[0], Arrays.Types[1])
        }
      }

      Quest.repeatableQuests[Digit].numQuests = Type.QuestAmount;

      Quest.repeatableQuests[Digit].minPlayerLevel = Type.Access
      Quest.repeatableQuests[Digit].rewardScaling.rewardSpread = Type.Spread;
      Quest.repeatableQuests[Digit].questConfig.Exploration.maxExtracts = Type.Extracts;
      Quest.repeatableQuests[Digit].questConfig.Completion.minRequestedAmount = Type.MinItems;
      Quest.repeatableQuests[Digit].questConfig.Completion.maxRequestedAmount = Type.MaxItems;
      Quest.repeatableQuests[Digit].questConfig.Elimination[0].minKills = Type.MinKillsLR1;
      Quest.repeatableQuests[Digit].questConfig.Elimination[0].maxKills = Type.MaxKillsLR1;
      Quest.repeatableQuests[Digit].questConfig.Elimination[1].minKills = Type.MinKillsLR2;
      Quest.repeatableQuests[Digit].questConfig.Elimination[1].maxKills = Type.MaxKillsLR2;
      if (Digit < 2) {
        Quest.repeatableQuests[Digit].questConfig.Elimination[2].minKills = Type.MinKillsLR3;
        Quest.repeatableQuests[Digit].questConfig.Elimination[2].maxKills = Type.MaxKillsLR3;
      }
    }
    function AirdropContents(DBType, Type) {
      if (Airdrop.loot[DBType] != undefined) {
        Airdrop.loot[DBType].itemCount.min = Type.BarterMin
        Airdrop.loot[DBType].itemCount.max = Type.BarterMax
        Airdrop.loot[DBType].weaponPresetCount.min = Type.PresetMin
        Airdrop.loot[DBType].weaponPresetCount.max = Type.PresetMax
        Airdrop.loot[DBType].armorPresetCount.min = Type.ArmorMin
        Airdrop.loot[DBType].armorPresetCount.max = Type.ArmorMax
        Airdrop.loot[DBType].weaponCrateCount.min = Type.CratesMin
        Airdrop.loot[DBType].weaponCrateCount.max = Type.CratesMax
      }
    }
    function QuestReward(Type, Digit) {
      try {
        let Levels = Type.Levels.split(",");
        let Exp = Type.Experience.split(",");
        let Reputation = Type.Reputation.split(",");
        let ItemsReward = Type.ItemsReward.split(",");
        let Roubles = Type.Roubles.split(",");
        let GPcoins = Type.GPcoins.split(",");
        let SkillChance = Type.SkillChance.split(",");
        let SkillPoint = Type.SkillPoint.split(",");

        if ((Levels.length == Exp.length) && (Levels.length == Reputation.length) &&
          (Levels.length == ItemsReward.length) && (Levels.length == Roubles.length) &&
          (Levels.length == GPcoins.length) && (Levels.length == SkillChance.length) && (Levels.length == SkillPoint.length)) {
          Quest.repeatableQuests[Digit].rewardScaling.levels = Levels.map(Number);
          Quest.repeatableQuests[Digit].rewardScaling.experience = Exp.map(Number);
          Quest.repeatableQuests[Digit].rewardScaling.reputation = Reputation.map(Number);
          Quest.repeatableQuests[Digit].rewardScaling.items = ItemsReward.map(Number);
          Quest.repeatableQuests[Digit].rewardScaling.roubles = Roubles.map(Number);
          Quest.repeatableQuests[Digit].rewardScaling.gpCoins = GPcoins.map(Number);
          Quest.repeatableQuests[Digit].rewardScaling.skillRewardChance = SkillChance.map(Number);
          Quest.repeatableQuests[Digit].rewardScaling.skillPointReward = SkillPoint.map(Number);
        }
        else {
          Logger.error("[SVM] REPEATABLE QUESTS - Daily rewards scales written wrongly, read FAQ, changes ignored.")
        }
      }
      catch {
        Logger.error("[SVM] REPEATABLE QUESTS - Daily rewards scales written wrongly, read FAQ, changes ignored.")
      }
    }
    function isJSONValueDefined(value) {
      return value !== undefined && !value.isNaN;
    }
    function FreeExit(Exit) {
      Exit.PassageRequirement = "None";
      Exit.ExfiltrationType = "Individual";
      Exit.Id = '';
      Exit.Count = 0;
      Exit.PlayersCount = 0;
      Exit.RequirementTip = '';
      if (Exit.RequiredSlot) {
        delete Exit.RequiredSlot;
      }
    }
    function IDChanger(Variables) {
      try {
        switch (Variables.length) {
          case 3:
            items[Variables[0]]._props[Variables[1]] = CheckType(Variables[2])
            break;
          case 4:
            if (SymbolCheck(Variables[2])) {
              items[Variables[0]]._props[Variables[1]] = Calculus(items[Variables[0]]._props[Variables[1]], Variables[2], Variables[3])
            }
            else {
              items[Variables[0]]._props[Variables[1]][Variables[2]] = CheckType(Variables[3])
            }
            break;
          case 5:
            if (SymbolCheck(Variables[3])) {
              items[Variables[0]]._props[Variables[1]][Variables[2]] = Calculus(items[Variables[0]]._props[Variables[1]][Variables[2]], Variables[3], Variables[4])
            }
            else {
              items[Variables[0]]._props[Variables[1]][Variables[2]][Variables[3]] = CheckType(Variables[4])
            }
            break;
          case 6:
            if (SymbolCheck(Variables[4])) {
              items[Variables[0]]._props[Variables[1]][Variables[2]][Variables[3]] = Calculus(items[Variables[0]]._props[Variables[1]][Variables[2]][Variables[3]], Variables[4], Variables[5])
            }
            else {
              items[Variables[0]]._props[Variables[1]][Variables[2]][Variables[3]][Variables[4]] = CheckType(Variables[5])
            }
            break;
          case 7:
            items[Variables[0]]._props[Variables[1]][Variables[2]][Variables[3]][Variables[4]][Variables[5]] = CheckType(Variables[6])
            break;
          case 8:
            items[Variables[0]]._props[Variables[1]][Variables[2]][Variables[3]][Variables[4]][Variables[5]][Variables[6]] = CheckType(Variables[7])
            break;
          case 9:
            items[Variables[0]]._props[Variables[1]][Variables[2]][Variables[3]][Variables[4]][Variables[5]][Variables[6]][Variables[7]] = CheckType(Variables[8])
            break;
          case 10:
            items[Variables[0]]._props[Variables[1]][Variables[2]][Variables[3]][Variables[4]][Variables[5]][Variables[6]][Variables[7]][Variables[8]] = CheckType(Variables[9])
            break;
          default:
            Logger.error("[SVM] INVENTORY AND ITEMS - Custom properties line failed, More than 10 or less than 3 variables?")
            break;
        }
      }
      catch (e) {
        Logger.error("[SVM] INVENTORY AND ITEMS - Custom properties line failed, something ain't right\n" + e)
      }
    }
    function CheckType(object) {
      if (object.includes(",") || object.includes("[")) {
        return Filter(object)
      }
      else if (isNaN(object) && object !== 'true' && object !== 'false') {
        return object;
      }
      else {
        return JSON.parse(object)
      }
    }
    function SymbolCheck(Value) {
      return (Value == "*" || Value == "/" || Value == "+" || Value == "-");
    }
    function Calculus(Field, Operand, Value) {
      switch (Operand) {
        case "/":
          Field = parseInt(parseInt(Field) / parseFloat(Value))
          break;
        case "*":
          Field = parseInt(parseInt(Field) * parseFloat(Value))
          break;
        case "+":
          Field = parseInt(parseInt(Field) + parseFloat(Value))
          break;
        case "-":
          Field = parseInt(parseInt(Field) - parseFloat(Value))
          break;
      }
      return Field
    }
    function AmmoFilter(AID, Comp) {
      for (let ID in AID) {
        if (Comp.includes(AID[ID])) {
          return true;
        }
      }
      return false;
    }
    //initialise complete logger
    const Misc = require('../src/Misc.json');
    Logger.log(`[SVM] Initialization complete. ` + Misc.funni[Math.floor(Math.random() * Misc.funni.length)], "blue");
    if (PresetLoader.CurrentlySelectedPreset != "" && PresetLoader.CurrentlySelectedPreset != undefined) {
      Logger.log("[SVM] Preset - " + PresetLoader.CurrentlySelectedPreset + " - successfully loaded", "blue");
    }
  }
}
module.exports = {
  mod: new MainSVM
};