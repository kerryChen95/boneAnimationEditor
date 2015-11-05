/**
骨骼model的类
@module
**/
define([
    'underscore', 'backbone',
    'util'
], function(
    _, Backbone,
    util
){
    var findWhere = _.findWhere,
        extend = _.extend,
        createId = util.createId,
        Bone;

    /**
    @class Bone
    @extends Backbone.Model
    **/
    Bone = Backbone.Model.extend({
        // 约定这些默认字段就是骨骼model的全部字段（除了id）
        defaults: {
            // 骨骼的名字
            name: 'bone',
            // 纹理图的url
            texture: 'img/defaultTexture.png',
            // 父骨骼的id
            parent: null
        },

        initialize: function(){
            var id;

            // 创建骨骼id
            id = createId();
            console.debug('A new bone model %s is created', id);
            this.set('id', id);

            ++Bone._boneCount;
            // 设置默认骨骼名
            this.set('name', 'bone' + Bone._boneCount);
        },

        // By default `validate()` is called before save,
        // but can also be called before `set()` if `{validate:true}` is passed
        validate: function(attrs, options){
            var errorMsg = {};
            if( !_.isString(atts.name) ){
                errorMsg.name = 'Bone name should be a string';
            }
            if( !_.isString(atts.texture) ){
                errorMsg.texture = 'Bone texture should be a string';
            }
            // TODO: id的格式确定之后，检验 `parents` 是否符合id的格式
            if( atts.parent !== null && !_.isString(atts.parent) ){
                errorMsg.parent = 'Bone parent should be ';
            }

            if( !util.isEmptyObj(errorMsg) ){
                console.debug(
                    'Bone '
                );
                return errorMsg;
            }
        },

        fetch: function(){},

        save: function(){}
    }, {
        // 骨骼实例的数量
        _boneCount: 0
    });

    return Bone;
});
