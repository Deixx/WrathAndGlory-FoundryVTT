import ArchetypeGeneric from "../../apps/archetype-generic.js";
import ArchetypeGroups from "../../apps/archetype-groups.js";
import ItemTraits from "../../apps/item-traits.js";
import { WrathAndGloryItem } from "../item.js";

export class WrathAndGloryItemSheet extends ItemSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["wrath-and-glory", "sheet", "item"],
      resizable: true,
      scrollY: [".sheet-body"],
      width: 650,
      height: 600,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "description",
        },
      ],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("input").focusin(ev => this._onFocusIn(ev));
  }

  get template() {
    return `systems/wrath-and-glory/template/item/${this.item.type}.html`
  }

  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();
    buttons = [
      {
        label: game.i18n.localize("BUTTON.POST_ITEM"),
        class: "item-post",
        icon: "fas fa-comment",
        onclick: (ev) => this.item.sendToChat(),
      }
    ].concat(buttons);
    return buttons;
  }

  getData() {

    const data = super.getData();

    // If this is a temp item with an archetype parent
    if (this.item.archetype) {
      let list = duplicate(this.item.archetype.wargear)
      let wargearObj = list[this.item.wargearIndex];
      mergeObject(data.data, wargearObj.diff, { overwrite: true }) // Merge archetype diff with item data
      data.name = wargearObj.diff.name || data.item.name
    }
    else
      data.name = data.item.name

    data.data = data.data.data // project system data so that handlebars has the same name and value paths

    data.conditions = CONFIG.statusEffects.map(i => {
      return {
          label : i.label,
          key : i.id,
          img : i.icon,
          existing : this.item.hasCondition(i.id)
      }
    })  

    data.rangeType = (this.item.isMelee || this.item.category == "grenade-missile") ? "single" : "multi"

    if (this.item.type == "archetype")
    {
      let element = $(ArchetypeGroups.constructHTML(this.item, {parentheses: true, commas: true, draggable:false}))
      // Remove unnecessary outside parentheses
      let parentheses = Array.from(element.find(".parentheses"))
      parentheses[0].remove();
      parentheses[parentheses.length - 1].remove()
      data.wargearHTML = `<div class="group-wrapper">${element.html()}</div>`

      data.talents = this.item.suggested.talents.map(i => `<a class="archetype-item" data-id=${i.id}>${i.name}</a>`).join("<span class='connector'>,</span>")
    }
    return data;
  }

  async _updateObject(event, formData) {
    // If this item is from an archetype entry, update the diff instead of the actual item
    // I would like to have done this is the item's _preCreate but the item seems to lose 
    // its "archetype" reference so it has to be done here
    // TODO: Current Issue - changing a property, then changing back to the original value
    // does not work due to `diffObject()`

    if (this.item.archetype) {
      // Get the archetype's wargear, find the corresponding object, add to its diff
      let list = duplicate(this.item.archetype.wargear)
      let wargearObj = list[this.item.wargearIndex];
      mergeObject( // Merge current diff with new diff
        wargearObj.diff,
        diffObject(this.item.toObject(), expandObject(formData)),
        { overwrite: true })

      // If the diff includes the item's name, change the name stored in the archetype
      if (wargearObj.diff.name)
        wargearObj.name = wargearObj.diff.name
      else
        wargearObj.name = this.item.name

      this.item.archetype.update({ "data.wargear": list })
      return
    }

    // Special processing for archetype items to parse a list of skills available to spend exp on from the checkboxes
    if (this.item.type == "archetype") {
      let skills = []
      this.element.find(".skill-checkbox").each((i, cb) => {
        if (cb.checked)
          skills.push(cb.dataset.skill)
      });

      // Add skills array to form data
      formData["data.skills.list"] = skills
    }
    return super._updateObject(event, formData)
  }

  _onDrop(ev) {
    let dragData = JSON.parse(ev.dataTransfer.getData("text/plain"));
    let dropItem = game.items.get(dragData.id)



    if (this.item.type === "weapon" && dropItem && dropItem.type === "weaponUpgrade")
    {
      let upgrades = duplicate(this.item.upgrades)
      let upgrade = dropItem.toObject();
      upgrade._id = randomID()
      upgrades.push(upgrade)
      this.item.update({"data.upgrades" : upgrades})
      ui.notifications.notify("Upgrade applied to " + this.item.name)
    } 
    else if (this.item.type == "archetype")
    {
      this.item.handleArchetypeItem(dropItem);
    }
    else if (dragData.type == "ActiveEffect")
    {
      this.item.createEmbeddedDocuments("ActiveEffect", [dragData.data])
    }
  }


  /** @inheritdoc */
  _onDragStart(event) {
    super._onDragStart(event)
    const li = event.currentTarget;

    // Create drag data
    const dragData = {
      itemId: this.item.id,
    };


    // Active Effect
    if ( li.dataset.effectId ) {
      const effect = this.item.effects.get(li.dataset.effectId);
      dragData.type = "ActiveEffect";
      dragData.data = effect.data;
    }

    // Set data transfer
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }


  _updatePotency(index, path, value) {
    let potency = foundry.utils.deepClone(this.item.potency)
    if (Number.isNumeric(value) && typeof value != "boolean") // 
      value = Number(value)

    setProperty(potency[index], path, value)

    this.item.update({ "data.potency": potency })
  }

    // Prevent upgrades from stacking
  _getSubmitData(updateData = {}) {
    let data = super._getSubmitData(updateData);
    data = diffObject(flattenObject(this.item.toObject(false)), data)
    return data
  }


  _onFocusIn(event) {
    $(event.currentTarget).select();
  }

  activateListeners(html) {
    super.activateListeners(html)

    html.find(".item-traits").click(ev => {
      if (this.item.type == "weaponUpgrade" || this.item.type == "ammo")
      {
        let type = ev.currentTarget.classList.contains("add") ? "add" : "remove"
        new ItemTraits(this.item, {type}).render(true)
      }
      else 
        new ItemTraits(this.item).render(true)
    })

    html.find(".effect-create").click(async ev => {
      if (this.item.isOwned)
        ui.notifications.error("Effects can only be added to world items or actors directly")
      let effectData = { label: this.item.name, icon: this.item.data.img }

        let html = await renderTemplate("systems/wrath-and-glory/template/apps/quick-effect.html", effectData)
        let dialog = new Dialog({
            title : "Quick Effect",
            content : html,
            buttons : {
                "create" : {
                    label : "Create",
                    callback : html => {
                        let mode = 2
                        let label = html.find(".label").val()
                        let key = html.find(".key").val()
                        let value = parseInt(html.find(".modifier").val())
                        effectData.label = label
                        effectData.changes = [{key, mode, value}]
                        this.object.createEmbeddedDocuments("ActiveEffect", [effectData])
                    }
                },
                "skip" : {
                    label : "Skip",
                    callback : () => this.object.createEmbeddedDocuments("ActiveEffect", [effectData]).then(effect => effect[0].sheet.render(true))
                }
            }
        })
        await dialog._render(true)
        dialog._element.find(".label").select()

    })

    html.find(".effect-edit").click(ev => {
      let id = $(ev.currentTarget).parents(".item").attr("data-effect-id")
      this.object.effects.get(id).sheet.render(true)
    })

    html.find(".effect-delete").click(ev => {
      let id = $(ev.currentTarget).parents(".item").attr("data-effect-id")
      this.object.deleteEmbeddedDocuments("ActiveEffect", [id])
    })

    html.find(".upgrade-delete").click(ev => {
      let index = parseInt($(ev.currentTarget).parents(".item").attr("data-index"))
      let upgrades = duplicate(this.item.upgrades)
      upgrades.splice(index, 1)
      return this.item.update({ "data.upgrades": upgrades })
    })

    html.find(".upgrade-name").click(ev => {
      let index = parseInt($(ev.currentTarget).parents(".item").attr("data-index"))
      this.item.Upgrades[index].sheet.render(true)
      ui.notifications.warn("Changes made to an upgrade will not be saved")
    })


    html.find(".condition-toggle").click(event => {
      let key = $(event.currentTarget).parents(".condition").attr("data-key")
      if (this.item.hasCondition(key))
        this.item.removeCondition(key)
      else
        this.item.addCondition(key)
    })

    html.find(".item-checkbox").click(ev => {
      let target = ev.currentTarget.dataset["target"]
      
      if (target == "potency")
      {
        let index = parseInt($(ev.currentTarget).parents(".potency-fields").attr("data-index"))
        let path = ev.currentTarget.dataset["path"]
        this._updatePotency(index, path, !ev.currentTarget.classList.contains("checked"))
      }
      else
        this.item.update({ [target]: !getProperty(this.item.data, target) })
    })

    html.find(".add-potency").click(ev => {
      let potency = duplicate(this.item.potency)
      potency.push({
        "description": "",
        "cost": 1,
        "property": "",
        "initial": "",
        "value": "",
        "single" : false
      })
      this.item.update({ "data.potency": potency })
    })

    html.find(".potency-delete").click(ev => {
      let index = parseInt($(ev.currentTarget).parents(".potency-fields").attr("data-index"))
      let potency = duplicate(this.item.potency)
      potency.splice(index, 1)
      this.item.update({ "data.potency": potency })
    })

    
    html.find(".potency-fields input").change(ev => {
      let index = parseInt($(ev.currentTarget).parents(".potency-fields").attr("data-index"))
      let path = ev.currentTarget.dataset.path
      this._updatePotency(index, path, ev.target.value)
    })

    html.find(".add-generic").click(async ev => {
      new ArchetypeGeneric({item: this.item}).render(true)
    })

    html.find(".reset").click(ev => {
      this.item.resetGroups();
    })

    html.find(".configure-groups").click(ev => {
      new ArchetypeGroups(this.item).render(true)
    })

    html.find(".wargear").mouseup(ev => {
      let path = ev.currentTarget.dataset.path
      let index = Number(ev.currentTarget.dataset.index)
      let array = duplicate(getProperty(this.item.data, path));

      let obj = array[index];

      if (obj) {
        if (ev.button == 0)
        {
          if (obj.type == "generic")
          new ArchetypeGeneric({item: this.item, index}).render(true);
          else
            new WrathAndGloryItem(game.items.get(obj.id).toObject(), { archetype: { item: this.item, index } }).sheet.render(true)
        }
        else {
          new Dialog({
            title: "Delete Item?",
            content: "Do you want to remove this item from the Archetype? This will reset the groupings.",
            buttons: {
              yes: {
                label: "Yes",
                callback: async () => {
                  array.splice(index, 1)
                  await this.item.update({ [`${path}`]: array })
                  if (path.includes("wargear")) {
                    this.item.resetGroups();
                  }
                }
              },
              no: {
                label: "No",
                callback: () => { }
              }
            }
          }).render(true)
        }
      }
    })

  }

}