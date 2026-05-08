import { defineComponent, h } from 'vue';

export const IconHeadset = defineComponent({
  name: 'IconHeadset',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M192 576V448c0-176 144-320 320-320s320 144 320 320v128", "fillRule": "evenodd"}),
        h('path', {"d": "M832 800v48c0 80-64 144-144 144H512", "fillRule": "evenodd"})
      ]
    );
  }
});
